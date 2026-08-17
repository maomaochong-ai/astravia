import type { CommitNode } from "./types";

/**
 * Swimlane layout, ported faithfully from Zed's git graph
 * (zed-industries/zed `crates/git_ui/src/git_graph.rs`, `GraphData::add_commits`
 * + `LaneState::to_commit_lines`). Commits are processed newest-first (row 0 at
 * top); lanes free up when a branch ends and are reused (`firstEmptyLaneIdx`),
 * which is what keeps the graph compact — unlike a fixed-column-per-branch layout.
 */

export type GraphCurveKind = "merge" | "checkout";

export type GraphSegment =
	| { kind: "straight"; toRow: number }
	| { kind: "curve"; toColumn: number; onRow: number; curve: GraphCurveKind };

export interface GraphCommit {
	hash: string;
	row: number;
	lane: number;
	colorIdx: number;
}

/** A drawn edge from a child commit down to a parent, as a sequence of segments. */
export interface GraphLine {
	childColumn: number;
	startRow: number;
	endRow: number;
	colorIdx: number;
	segments: GraphSegment[];
}

export interface GraphLayout {
	commits: GraphCommit[];
	lines: GraphLine[];
	maxLanes: number;
}

// Sentinel for an as-yet-unresolved row/column (Zed uses usize::MAX).
const UNSET = -1;

interface ActiveLane {
	color: number | null;
	startingRow: number;
	startingCol: number;
	destinationColumn: number | null;
	segments: GraphSegment[];
}

type Lane = ActiveLane | null;

function firstEmptyLaneIdx(lanes: Lane[]): number {
	const idx = lanes.findIndex((l) => l === null);
	if (idx >= 0) return idx;
	lanes.push(null);
	return lanes.length - 1;
}

/**
 * Finalize an active lane that ends at a commit into a {@link GraphLine}, port of
 * `LaneState::to_commit_lines`. `laneColumn` is this lane's column; `parentColumn`
 * is the column of the commit the line ends at.
 */
function laneToCommitLine(lane: ActiveLane, endingRow: number, laneColumn: number, parentColumn: number, parentColor: number): GraphLine {
	const finalDestination = lane.destinationColumn ?? parentColumn;
	const finalColor = lane.color ?? parentColor;
	const segments = lane.segments;
	const last = segments[segments.length - 1];

	if (last?.kind === "straight" && last.toRow === UNSET) {
		if (finalDestination !== laneColumn) {
			last.toRow = endingRow - 1;
			const curved: GraphSegment = { kind: "curve", toColumn: finalDestination, onRow: endingRow, curve: "checkout" };
			if (last.toRow === lane.startingRow) {
				segments[segments.length - 1] = curved;
			} else {
				segments.push(curved);
			}
		} else {
			last.toRow = endingRow;
		}
	} else if (last?.kind === "curve" && last.onRow === UNSET) {
		if (last.toColumn === UNSET) last.toColumn = finalDestination;
		if (last.curve === "merge") {
			last.onRow = lane.startingRow + 1;
			if (last.onRow < endingRow) {
				if (last.toColumn !== finalDestination) {
					segments.push({ kind: "straight", toRow: endingRow - 1 });
					segments.push({ kind: "curve", toColumn: finalDestination, onRow: endingRow, curve: "checkout" });
				} else {
					segments.push({ kind: "straight", toRow: endingRow });
				}
			} else if (last.toColumn !== finalDestination) {
				segments.push({ kind: "curve", toColumn: finalDestination, onRow: endingRow, curve: "checkout" });
			}
		} else {
			last.onRow = endingRow;
			if (last.toColumn !== finalDestination) {
				segments.push({ kind: "straight", toRow: endingRow });
				segments.push({ kind: "curve", toColumn: finalDestination, onRow: endingRow, curve: "checkout" });
			}
		}
	} else if (last?.kind === "curve") {
		if (last.onRow < endingRow) {
			if (last.toColumn !== finalDestination) {
				segments.push({ kind: "straight", toRow: endingRow - 1 });
				segments.push({ kind: "curve", toColumn: finalDestination, onRow: endingRow, curve: "checkout" });
			} else {
				segments.push({ kind: "straight", toRow: endingRow });
			}
		} else if (last.toColumn !== finalDestination) {
			segments.push({ kind: "curve", toColumn: finalDestination, onRow: endingRow, curve: "checkout" });
		}
	}

	return { childColumn: lane.startingCol, startRow: lane.startingRow, endRow: endingRow, colorIdx: finalColor, segments };
}

/** Compute the swimlane layout for commits ordered newest-first. */
export function computeGraphLayout(nodes: readonly CommitNode[], colorsCount: number): GraphLayout {
	const laneStates: Lane[] = [];
	const laneColors = new Map<number, number>();
	const parentToLanes = new Map<string, number[]>();
	const commits: GraphCommit[] = [];
	const lines: GraphLine[] = [];
	let nextColor = 0;
	let maxLanes = 0;

	const getLaneColor = (laneIdx: number): number => {
		let c = laneColors.get(laneIdx);
		if (c === undefined) {
			c = nextColor;
			nextColor = (nextColor + 1) % colorsCount;
			laneColors.set(laneIdx, c);
		}
		return c;
	};

	for (let commitRow = 0; commitRow < nodes.length; commitRow++) {
		const commit = nodes[commitRow];
		const waiting = parentToLanes.get(commit.hash);
		const commitLane = waiting && waiting.length > 0 ? Math.min(...waiting) : firstEmptyLaneIdx(laneStates);
		const commitColor = getLaneColor(commitLane);

		if (waiting) {
			parentToLanes.delete(commit.hash);
			for (const laneColumn of waiting) {
				const state = laneStates[laneColumn];
				if (state) {
					// Merge-overlap avoidance: keep the merge curve in its own column if
					// curving into the target column would cross an intervening commit.
					const first = state.segments[0];
					if (first && first.kind === "curve" && first.curve === "merge") {
						const curveRow = state.startingRow + 1;
						const wouldOverlap =
							laneColumn !== commitLane && curveRow < commitRow
								? commits.slice(curveRow, commitRow).some((c) => c.lane === commitLane)
								: false;
						if (wouldOverlap) first.toColumn = laneColumn;
					}
					lines.push(laneToCommitLine(state, commitRow, laneColumn, commitLane, commitColor));
					laneStates[laneColumn] = null;
				}
			}
		}

		commit.parents.forEach((parent, parentIdx) => {
			if (parentIdx === 0) {
				laneStates[commitLane] = {
					color: commitColor,
					startingRow: commitRow,
					startingCol: commitLane,
					destinationColumn: null,
					segments: [{ kind: "straight", toRow: UNSET }],
				};
				let arr = parentToLanes.get(parent);
				if (!arr) parentToLanes.set(parent, (arr = []));
				arr.push(commitLane);
			} else {
				const newLane = firstEmptyLaneIdx(laneStates);
				laneStates[newLane] = {
					color: null,
					startingRow: commitRow,
					startingCol: commitLane,
					destinationColumn: null,
					segments: [{ kind: "curve", toColumn: UNSET, onRow: UNSET, curve: "merge" }],
				};
				let arr = parentToLanes.get(parent);
				if (!arr) parentToLanes.set(parent, (arr = []));
				arr.push(newLane);
			}
		});

		maxLanes = Math.max(maxLanes, laneStates.length);
		commits.push({ hash: commit.hash, row: commitRow, lane: commitLane, colorIdx: commitColor });
	}

	return { commits, lines, maxLanes };
}
