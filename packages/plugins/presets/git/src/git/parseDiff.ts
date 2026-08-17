export type DiffLineType = "add" | "del" | "context" | "hunk";

export interface DiffLine {
	type: DiffLineType;
	text: string;
	oldNo?: number;
	newNo?: number;
}

export interface ParsedDiff {
	lines: DiffLine[];
	binary: boolean;
}

const HUNK_RE = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/** Parse a unified diff patch into renderable lines (no syntax highlighting). */
export function parseDiff(patch: string): ParsedDiff {
	const lines: DiffLine[] = [];
	let oldNo = 0;
	let newNo = 0;
	let binary = false;
	for (const raw of patch.split("\n")) {
		if (raw.startsWith("Binary files") || raw.startsWith("GIT binary patch")) {
			binary = true;
			continue;
		}
		// Skip file/extended headers.
		if (
			raw.startsWith("diff --git") ||
			raw.startsWith("index ") ||
			raw.startsWith("--- ") ||
			raw.startsWith("+++ ") ||
			raw.startsWith("new file") ||
			raw.startsWith("deleted file") ||
			raw.startsWith("old mode") ||
			raw.startsWith("new mode") ||
			raw.startsWith("similarity index") ||
			raw.startsWith("rename from") ||
			raw.startsWith("rename to") ||
			raw.startsWith("\\ No newline")
		) {
			continue;
		}
		const hunk = HUNK_RE.exec(raw);
		if (hunk) {
			oldNo = Number(hunk[1]);
			newNo = Number(hunk[2]);
			lines.push({ type: "hunk", text: raw });
			continue;
		}
		if (raw.startsWith("+")) {
			lines.push({ type: "add", text: raw.slice(1), newNo });
			newNo += 1;
		} else if (raw.startsWith("-")) {
			lines.push({ type: "del", text: raw.slice(1), oldNo });
			oldNo += 1;
		} else if (raw.startsWith(" ")) {
			lines.push({ type: "context", text: raw.slice(1), oldNo, newNo });
			oldNo += 1;
			newNo += 1;
		}
	}
	return { lines, binary };
}
