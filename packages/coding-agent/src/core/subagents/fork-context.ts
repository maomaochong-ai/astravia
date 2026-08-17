/**
 * Fork-context seeding for workflow subagents (ADR-0044).
 *
 * Converts the parent's resolved branch context (buildSessionContext output)
 * into entries that can be appended to a fresh child SessionManager:
 * - compaction/branch summary messages become plain CustomMessages (those roles
 *   are reserved for top-level entries and cannot be appended directly)
 * - a trailing assistant message with unresolved tool calls is cut, together
 *   with its partial results (the dispatch tool itself is still executing in
 *   the parent when the snapshot is taken)
 */

import type { AgentMessage } from "@astravia/agent-core";
import {
	BRANCH_SUMMARY_PREFIX,
	BRANCH_SUMMARY_SUFFIX,
	COMPACTION_SUMMARY_PREFIX,
	COMPACTION_SUMMARY_SUFFIX,
	type CustomMessage,
} from "../messages.js";
import type { SessionManager } from "../session-manager/index.js";

export const FORK_CONTEXT_SUMMARY_TYPE = "workflow-fork-summary";

type SeedMessage = Parameters<SessionManager["appendMessage"]>[0];

/** Drop a trailing assistant message whose tool calls have no results yet (plus its partial results). */
export function trimDanglingToolCalls(messages: AgentMessage[]): AgentMessage[] {
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i];
		if (m.role === "toolResult") continue;
		if (m.role !== "assistant") break;
		const toolCallIds = m.content.filter((c) => c.type === "toolCall").map((c) => c.id);
		if (toolCallIds.length === 0) break;
		const resultIds = new Set(
			messages
				.slice(i + 1)
				.filter((r) => r.role === "toolResult")
				.map((r) => (r as { toolCallId: string }).toolCallId),
		);
		if (toolCallIds.every((id) => resultIds.has(id))) break;
		return messages.slice(0, i);
	}
	return messages;
}

export function buildForkSeedMessages(messages: AgentMessage[]): SeedMessage[] {
	const trimmed = trimDanglingToolCalls(messages);
	const seeds: SeedMessage[] = [];
	for (const m of trimmed) {
		switch (m.role) {
			case "compactionSummary": {
				const custom: CustomMessage = {
					role: "custom",
					customType: FORK_CONTEXT_SUMMARY_TYPE,
					content: COMPACTION_SUMMARY_PREFIX + m.summary + COMPACTION_SUMMARY_SUFFIX,
					display: false,
					timestamp: m.timestamp,
				};
				seeds.push(custom);
				break;
			}
			case "branchSummary": {
				const custom: CustomMessage = {
					role: "custom",
					customType: FORK_CONTEXT_SUMMARY_TYPE,
					content: BRANCH_SUMMARY_PREFIX + m.summary + BRANCH_SUMMARY_SUFFIX,
					display: false,
					timestamp: m.timestamp,
				};
				seeds.push(custom);
				break;
			}
			case "user":
			case "assistant":
			case "toolResult":
			case "custom":
			case "bashExecution":
				seeds.push(m as SeedMessage);
				break;
			default:
				break;
		}
	}
	return seeds;
}

/** Append the fork snapshot into a fresh child SessionManager (before session creation). */
export function seedForkContext(sessionManager: SessionManager, messages: AgentMessage[]): number {
	const seeds = buildForkSeedMessages(messages);
	for (const seed of seeds) {
		sessionManager.appendMessage(seed);
	}
	return seeds.length;
}
