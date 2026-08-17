/**
 * memory flush (ADR-0009): the rescue step run just before a session rollover.
 *
 * Before the about-to-be-dropped context is summarized and rolled into a new
 * file, we make one dedicated LLM call to extract durable facts worth keeping
 * and append them to MEMORY.md. This is the guaranteed write point that keeps
 * MEMORY.md from staying empty, complementing the agent-driven `memory` tool.
 *
 * Mirrors Hermes's flush_memories() in intent. We use a standalone
 * completeSimple call (not a re-entrant agent turn) to avoid tangling with the
 * compaction/agent loop. Writes go to disk only — the in-process system-prompt
 * snapshot stays frozen and picks the new entries up on the next session.
 */

import type { AgentMessage } from "@astravia/agent-core";
import { completeSimple, type Model } from "@astravia/ai";
import { applyMemoryOperation, parseMemoryEntries, readMemoryContent } from "./memory-store.js";

const FLUSH_SYSTEM_PROMPT =
	"You maintain a concise long-term MEMORY for an AI assistant that talks to a single user across many " +
	"conversations. You will be given the current memory and a slice of conversation that is about to be " +
	"discarded from context. Extract ONLY durable facts worth remembering long-term: who the user is, their " +
	"preferences and environment, ongoing projects and goals, key decisions, and hard-won lessons. " +
	"Ignore transient chatter, one-off task details, and anything already captured in the current memory. " +
	"Output each new fact on its own line prefixed with '- ', one self-contained fact per line. " +
	"If there is nothing new worth saving, output exactly: NONE";

/** Light text serialization of the messages being flushed — enough for fact extraction. */
function serializeForFlush(messages: AgentMessage[]): string {
	const parts: string[] = [];
	for (const message of messages) {
		if (message.role === "user") {
			const content = (message as { content: string | Array<{ type: string; text?: string }> }).content;
			if (typeof content === "string") {
				parts.push(`USER: ${content}`);
			} else if (Array.isArray(content)) {
				const text = content
					.filter((b) => b.type === "text" && b.text)
					.map((b) => b.text)
					.join("\n");
				if (text) parts.push(`USER: ${text}`);
			}
		} else if (message.role === "assistant") {
			const text = message.content
				.filter((b): b is { type: "text"; text: string } => b.type === "text")
				.map((b) => b.text)
				.join("\n");
			if (text) parts.push(`ASSISTANT: ${text}`);
		}
	}
	return parts.join("\n\n");
}

function parseFlushEntries(text: string): string[] {
	const lines = text.split("\n");
	const entries: string[] = [];
	for (const raw of lines) {
		const line = raw.trim();
		if (!line || line.toUpperCase() === "NONE") continue;
		if (line.startsWith("- ")) {
			const entry = line.slice(2).trim();
			if (entry) entries.push(entry);
		}
	}
	return entries;
}

/**
 * Extract durable facts from `messages` and append the new ones to MEMORY.md.
 * Best-effort: returns the entries actually written (possibly empty). Never
 * throws — flush failures must not block the rollover.
 */
export async function flushMemoryBeforeRollover(opts: {
	memoryFile: string;
	limit: number;
	messages: AgentMessage[];
	model: Model<any>;
	apiKey: string;
	signal?: AbortSignal;
}): Promise<string[]> {
	const { memoryFile, limit, messages, model, apiKey, signal } = opts;
	try {
		const conversationText = serializeForFlush(messages);
		if (!conversationText.trim()) return [];

		const existing = parseMemoryEntries(readMemoryContent(memoryFile));
		const existingBlock = existing.length > 0 ? existing.map((e, i) => `${i + 1}. ${e}`).join("\n") : "(empty)";

		const promptText =
			`<current-memory>\n${existingBlock}\n</current-memory>\n\n` +
			`<conversation-being-discarded>\n${conversationText}\n</conversation-being-discarded>`;

		const response = await completeSimple(
			model,
			{
				systemPrompt: FLUSH_SYSTEM_PROMPT,
				messages: [{ role: "user", content: [{ type: "text", text: promptText }], timestamp: Date.now() }],
			},
			{ maxTokens: 1024, signal, apiKey },
		);
		if (response.stopReason === "error") return [];

		const text = response.content
			.filter((c): c is { type: "text"; text: string } => c.type === "text")
			.map((c) => c.text)
			.join("\n");

		const candidates = parseFlushEntries(text);
		const written: string[] = [];
		for (const candidate of candidates) {
			// Cheap local dedupe against what's already there (the model is asked to
			// skip duplicates, but guard anyway).
			const current = parseMemoryEntries(readMemoryContent(memoryFile));
			const dup = current.some((e) => e.includes(candidate) || candidate.includes(e));
			if (dup) continue;
			try {
				applyMemoryOperation(memoryFile, "add", { content: candidate }, limit);
				written.push(candidate);
			} catch {
				// Over the char budget — stop adding, keep what we have.
				break;
			}
		}
		return written;
	} catch {
		return [];
	}
}
