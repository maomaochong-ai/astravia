/**
 * Project-level curated memory store (memory-mode only).
 *
 * Backs a single `MEMORY.md` file living at a stable, run-cwd-independent
 * path (im-gateway passes it via `--memory-file`). Entries are separated by
 * a distinctive sentinel so `replace` / `remove` can target an individual
 * entry by substring without a parser. See ADR-0009 and CONTEXT.md term
 * `MEMORY.md`.
 *
 * The "frozen snapshot" discipline (reads injected into the system prompt are
 * captured once at session start, never mid-turn) is enforced by the caller
 * (AgentSession), not here — this module only does file I/O + entry algebra.
 */

import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";

/** Default character budget for the serialized MEMORY.md body. */
export const DEFAULT_MEMORY_CHAR_LIMIT = 4000;

/** On-its-own-paragraph sentinel separating entries. Distinctive enough to
 * never collide with normal markdown content. */
const ENTRY_SEP = "\n\n§\n\n";

export type MemoryAction = "add" | "replace" | "remove";

export interface MemoryState {
	/** Current entries after the operation, in file order. */
	entries: string[];
	/** Serialized length in characters. */
	chars: number;
	/** Configured character budget. */
	limit: number;
}

/** Read raw MEMORY.md content. Returns "" when the file does not exist or is
 * unreadable — an absent memory file is the first-run case, not an error. */
export function readMemoryContent(path: string): string {
	try {
		return existsSync(path) ? readFileSync(path, "utf-8") : "";
	} catch {
		return "";
	}
}

/** Split raw content into trimmed, non-empty entries. */
export function parseMemoryEntries(content: string): string[] {
	return content
		.split(ENTRY_SEP)
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);
}

/** Serialize entries back to file content. */
export function serializeMemoryEntries(entries: string[]): string {
	return entries.join(ENTRY_SEP);
}

function stateOf(entries: string[], limit: number): MemoryState {
	return { entries, chars: serializeMemoryEntries(entries).length, limit };
}

function writeAtomic(path: string, content: string): void {
	const tmp = `${path}.tmp`;
	writeFileSync(tmp, content);
	renameSync(tmp, path);
}

/**
 * Apply an add / replace / remove operation to MEMORY.md and persist it.
 *
 * - `add`: append `content` as a new entry.
 * - `replace`: find the first entry containing `match` and replace it with `content`.
 * - `remove`: find the first entry containing `match` and drop it.
 *
 * Throws (without writing) when the operation would push the serialized body
 * past `limit` — the agent is expected to `remove` something first. This
 * mirrors Hermes's hard char limit + agent-driven curation.
 */
export function applyMemoryOperation(
	path: string,
	action: MemoryAction,
	opts: { content?: string; match?: string },
	limit: number = DEFAULT_MEMORY_CHAR_LIMIT,
): MemoryState {
	const entries = parseMemoryEntries(readMemoryContent(path));

	if (action === "add") {
		const content = (opts.content ?? "").trim();
		if (!content) {
			throw new Error("memory add: `content` is required and must be non-empty");
		}
		const next = [...entries, content];
		const serialized = serializeMemoryEntries(next);
		if (serialized.length > limit) {
			throw new Error(
				`memory add: would exceed the ${limit}-char limit (${serialized.length}). ` +
					`Remove or replace an existing entry first to make room.`,
			);
		}
		writeAtomic(path, serialized);
		return stateOf(next, limit);
	}

	if (action === "replace") {
		const match = (opts.match ?? "").trim();
		const content = (opts.content ?? "").trim();
		if (!match) throw new Error("memory replace: `match` is required");
		if (!content) throw new Error("memory replace: `content` is required and must be non-empty");
		const idx = entries.findIndex((entry) => entry.includes(match));
		if (idx === -1) {
			throw new Error(`memory replace: no entry matching ${JSON.stringify(match)}`);
		}
		const next = [...entries];
		next[idx] = content;
		const serialized = serializeMemoryEntries(next);
		if (serialized.length > limit) {
			throw new Error(
				`memory replace: would exceed the ${limit}-char limit (${serialized.length}). ` +
					`Shorten the entry or remove another one first.`,
			);
		}
		writeAtomic(path, serialized);
		return stateOf(next, limit);
	}

	// remove
	const match = (opts.match ?? "").trim();
	if (!match) throw new Error("memory remove: `match` is required");
	const idx = entries.findIndex((entry) => entry.includes(match));
	if (idx === -1) {
		throw new Error(`memory remove: no entry matching ${JSON.stringify(match)}`);
	}
	const next = entries.filter((_, i) => i !== idx);
	writeAtomic(path, serializeMemoryEntries(next));
	return stateOf(next, limit);
}

/** Render the frozen snapshot for injection into the system prompt. */
export function renderMemoryForPrompt(path: string, content: string, limit: number): string {
	const entries = parseMemoryEntries(content);
	const body =
		entries.length === 0
			? "(empty — no memories saved yet)"
			: entries.map((entry, i) => `${i + 1}. ${entry}`).join("\n");
	const usage = `${content.length}/${limit} chars`;
	return (
		`# Persistent Memory\n\n` +
		`Durable, curated notes you have saved across conversations about the user, the ` +
		`project, ongoing work, and lessons learned. Stored in \`${path}\`.\n\n` +
		`This is a FROZEN SNAPSHOT captured at the start of this session — edits you make ` +
		`via the \`memory\` tool are written to disk immediately and the tool shows you the ` +
		`updated state, but they only re-enter this system prompt on the NEXT session. Use ` +
		`the \`memory\` tool (add / replace / remove) to keep this current: save durable ` +
		`facts and decisions, not transient chatter. Keep it under ${limit} chars by ` +
		`pruning stale entries.\n\n` +
		`<memory ${usage}>\n${body}\n</memory>`
	);
}
