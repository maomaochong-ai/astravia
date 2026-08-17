/**
 * Dated work log (ADR-0009). In memory-mode the agent's run cwd IS today's
 * date directory (<im-gateway cwd>/<YYYY-MM-DD>/), so JOURNAL.md lives right in
 * the run cwd. It is the progressive-disclosure index that makes "what did I do
 * yesterday?" work: the agent reads ../<yesterday>/JOURNAL.md on demand.
 *
 * Populated from two sources (see ADR-0009): one concise line per turn-end, and
 * a richer section at each rollover. All writes are best-effort — journaling
 * must never break a turn.
 */

import { appendFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { AssistantMessage } from "@astravia/ai";

const MAX_LINE_TEXT = 200;
const MAX_SECTION_CHARS = 2000;

function pad2(n: number): string {
	return n < 10 ? `0${n}` : String(n);
}

function nowParts(): { date: string; time: string } {
	const d = new Date();
	const date = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
	const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
	return { date, time };
}

function journalPath(cwd: string): string {
	return join(cwd, "JOURNAL.md");
}

function ensureHeader(path: string, dateLabel: string): void {
	if (!existsSync(path)) {
		appendFileSync(path, `# Work log — ${dateLabel}\n\n`);
	}
}

function collapse(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

/** Pull file paths referenced by this turn's write/edit-style tool calls. */
function filesTouched(message: AssistantMessage): string[] {
	const files = new Set<string>();
	for (const block of message.content) {
		if (block.type !== "toolCall") continue;
		const args = block.arguments as Record<string, unknown> | undefined;
		if (!args) continue;
		for (const key of ["path", "file_path", "filePath", "output", "outputPath"]) {
			const value = args[key];
			if (typeof value === "string" && value.trim()) {
				files.add(value.trim());
			}
		}
	}
	return [...files];
}

/**
 * Append a one-line digest of a completed assistant turn to today's JOURNAL.md.
 * Skips aborted/errored turns and turns with nothing worth recording.
 */
export function appendJournalLine(cwd: string, message: AssistantMessage): void {
	try {
		if (message.stopReason === "aborted" || message.stopReason === "error") return;

		const text = collapse(
			message.content
				.filter((b): b is { type: "text"; text: string } => b.type === "text")
				.map((b) => b.text)
				.join(" "),
		);
		const files = filesTouched(message);
		if (!text && files.length === 0) return;

		const { date, time } = nowParts();
		const path = journalPath(cwd);
		ensureHeader(path, date);

		const truncated = text.length > MAX_LINE_TEXT ? `${text.slice(0, MAX_LINE_TEXT)}…` : text;
		const filesPart = files.length > 0 ? ` — files: ${files.join(", ")}` : "";
		appendFileSync(path, `- ${time} ${truncated}${filesPart}\n`);
	} catch {
		// best-effort
	}
}

/** Append a richer section to today's JOURNAL.md at rollover time. */
export function appendJournalSection(cwd: string, summary: string): void {
	try {
		const body = summary.length > MAX_SECTION_CHARS ? `${summary.slice(0, MAX_SECTION_CHARS)}…` : summary;
		if (!body.trim()) return;
		const { date, time } = nowParts();
		const path = journalPath(cwd);
		ensureHeader(path, date);
		appendFileSync(path, `\n## Rollover @ ${time}\n\n${body}\n`);
	} catch {
		// best-effort
	}
}
