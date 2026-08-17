import type { ChangeCode, ChangeEntry } from "./types";

/** Collapse porcelain v2 XY (index, worktree) status pair into one display code. */
function collapseCode(x: string, y: string): ChangeCode {
	if (x === "R" || y === "R") return "R";
	if (x === "A") return "A";
	if (x === "D" || y === "D") return "D";
	return "M";
}

/**
 * Parse `git status --porcelain=v2 -z` output into a flat change list.
 * Records are NUL-separated; rename entries (`2 …`) carry a second NUL-separated
 * original path. Ignored entries are not requested and therefore absent.
 */
export function parseStatus(raw: string): ChangeEntry[] {
	const tokens = raw.split("\0");
	const entries: ChangeEntry[] = [];
	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];
		if (token.length === 0) continue;
		const kind = token[0];
		if (kind === "1") {
			const parts = token.split(" ");
			const xy = parts[1] ?? "..";
			const path = parts.slice(8).join(" ");
			if (!path) continue;
			entries.push({ path, code: collapseCode(xy[0], xy[1]), staged: xy[0] !== "." });
		} else if (kind === "2") {
			const parts = token.split(" ");
			const xy = parts[1] ?? "..";
			const path = parts.slice(9).join(" ");
			// The original path is the next NUL-separated token.
			const origPath = tokens[i + 1] ?? "";
			i += 1;
			if (!path) continue;
			entries.push({ path, origPath: origPath || undefined, code: collapseCode(xy[0], xy[1]), staged: xy[0] !== "." });
		} else if (kind === "u") {
			const parts = token.split(" ");
			const path = parts.slice(10).join(" ");
			if (!path) continue;
			// Unmerged conflict — surface as modified.
			entries.push({ path, code: "M", staged: false });
		} else if (kind === "?") {
			const path = token.slice(2);
			if (!path) continue;
			entries.push({ path, code: "U", staged: false });
		}
		// kind === "!" (ignored) is not requested; skip anything else.
	}
	return entries;
}
