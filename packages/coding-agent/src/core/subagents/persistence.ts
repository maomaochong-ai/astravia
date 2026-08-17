/**
 * Child session directory layout under the parent session.
 *
 * <parent session dir>/.subagents/<parentSessionId>/
 *   <timestamp>_<childSessionId>.jsonl
 */

import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

export function resolveSubagentDir(
	parentSessionFile: string | undefined,
	parentSessionId: string,
	cwd: string,
): string {
	if (parentSessionFile) {
		return join(dirname(parentSessionFile), ".subagents", parentSessionId);
	}
	// In-memory parent: still provide a stable path under cwd for disk children if needed.
	return join(cwd, ".astravia", "sessions", ".subagents", parentSessionId);
}

export function ensureSubagentDir(dir: string): void {
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
}
