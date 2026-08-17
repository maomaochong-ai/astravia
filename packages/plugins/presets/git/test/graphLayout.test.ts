import { describe, expect, it } from "vitest";
import { computeGraphLayout } from "../src/git/graphLayout";
import type { CommitNode } from "../src/git/types";

function node(hash: string, parents: string[]): CommitNode {
	return { hash, parents, refs: [], authorName: "", authorEmail: "", timestamp: 0, subject: "", body: "" };
}

const lanesOf = (nodes: CommitNode[]) => computeGraphLayout(nodes, 8).commits.map((c) => c.lane);

describe("computeGraphLayout (Zed swimlane port)", () => {
	it("keeps a linear history in a single lane", () => {
		const layout = computeGraphLayout([node("a", ["b"]), node("b", ["c"]), node("c", [])], 8);
		expect(lanesOf([node("a", ["b"]), node("b", ["c"]), node("c", [])])).toEqual([0, 0, 0]);
		expect(layout.maxLanes).toBe(1);
	});

	it("places a 2-parent merge compactly (Zed merge test DAG)", () => {
		// o1 -> [o2, o3]; o2 -> [o4]; o3 -> [o4]; o4 -> []
		const nodes = [node("o1", ["o2", "o3"]), node("o2", ["o4"]), node("o3", ["o4"]), node("o4", [])];
		const layout = computeGraphLayout(nodes, 8);
		expect(layout.commits.map((c) => c.lane)).toEqual([0, 0, 1, 0]);
		expect(layout.maxLanes).toBe(2);
		// One edge per child→parent pair.
		expect(layout.lines).toHaveLength(4);
		// o1→o3 opens a merge curve into lane 1.
		const merge = layout.lines.find((l) => l.startRow === 0 && l.endRow === 2);
		expect(merge?.segments[0]).toMatchObject({ kind: "curve", curve: "merge", toColumn: 1 });
		// o3→o4 checks out back to lane 0.
		const checkout = layout.lines.find((l) => l.childColumn === 1);
		expect(checkout?.segments.at(-1)).toMatchObject({ kind: "curve", curve: "checkout", toColumn: 0 });
	});

	it("reuses a freed lane across sequential diamonds (stays compact)", () => {
		// Two diamonds in a row; the second must reuse lane 1, not allocate lane 2.
		const nodes = [
			node("a", ["b", "c"]),
			node("b", ["d"]),
			node("c", ["d"]),
			node("d", ["e", "f"]),
			node("e", ["g"]),
			node("f", ["g"]),
			node("g", []),
		];
		const layout = computeGraphLayout(nodes, 8);
		expect(layout.maxLanes).toBe(2);
		expect(layout.commits.map((c) => c.lane)).toEqual([0, 0, 1, 0, 0, 1, 0]);
	});

	it("handles a fresh branch tip with no children at the top", () => {
		// Two independent tips (no shared descendant loaded): each gets its own lane.
		const nodes = [node("x", ["z"]), node("y", ["z"]), node("z", [])];
		const layout = computeGraphLayout(nodes, 8);
		expect(layout.commits[0].lane).toBe(0);
		expect(layout.commits[1].lane).toBe(1);
		// z is waited on by both lanes; it lands in the leftmost (min) one.
		expect(layout.commits[2].lane).toBe(0);
	});
});
