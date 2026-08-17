import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "../../extensions/types.js";
import { applyMemoryOperation, DEFAULT_MEMORY_CHAR_LIMIT, type MemoryState } from "../../memory/memory-store.js";
import { loadToolDescription } from "../description.js";
import { toolCallDescriptionSchema } from "../tool-call-description.js";

const memorySchema = Type.Object({
	description: toolCallDescriptionSchema,
	action: Type.Union([Type.Literal("add"), Type.Literal("replace"), Type.Literal("remove")], {
		description: "add = append a new memory entry; replace = swap an existing entry; remove = delete an entry.",
	}),
	content: Type.Optional(
		Type.String({
			description: "The memory entry text. Required for add and replace. One self-contained fact per entry.",
		}),
	),
	match: Type.Optional(
		Type.String({
			description: "A substring identifying the existing entry to replace/remove. Required for replace and remove.",
		}),
	),
});

export interface MemoryToolDetails {
	action: "add" | "replace" | "remove";
	entryCount: number;
	chars: number;
	limit: number;
}

/**
 * Build the `memory` tool bound to a concrete MEMORY.md path and char budget.
 * Registered only in memory-mode (see ADR-0009); constructed per-session so
 * the file path is closed over.
 */
export function createMemoryTool(
	memoryFile: string,
	limit: number = DEFAULT_MEMORY_CHAR_LIMIT,
): ToolDefinition<typeof memorySchema, MemoryToolDetails> {
	const fallbackDescription =
		"Save or update durable, cross-session memory in MEMORY.md (frozen into the system prompt at session start). " +
		"Use it to remember who the user is, their preferences, ongoing projects, key decisions, and lessons learned. " +
		"Writes take effect on the next session; the tool returns the updated state for this session.";
	const description = loadToolDescription("memory", fallbackDescription);

	return {
		name: "memory",
		label: "Memory",
		scope_use: ["im-claw"],
		category: "memory",
		description,
		parameters: memorySchema,
		execute: async (_toolCallId, params) => {
			let state: MemoryState;
			try {
				state = applyMemoryOperation(
					memoryFile,
					params.action,
					{ content: params.content, match: params.match },
					limit,
				);
			} catch (error) {
				throw new Error(error instanceof Error ? error.message : String(error));
			}

			const detail: MemoryToolDetails = {
				action: params.action,
				entryCount: state.entries.length,
				chars: state.chars,
				limit: state.limit,
			};
			const listing =
				state.entries.length === 0 ? "(empty)" : state.entries.map((entry, i) => `${i + 1}. ${entry}`).join("\n");
			const summary =
				`memory ${params.action} ok — ${state.entries.length} entr${state.entries.length === 1 ? "y" : "ies"}, ` +
				`${state.chars}/${state.limit} chars.\n\nCurrent memory:\n${listing}`;
			return {
				content: [{ type: "text", text: summary }],
				details: detail,
			};
		},
	};
}
