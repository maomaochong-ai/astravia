/**
 * Session statistics, context-usage estimation, and message-text helpers.
 *
 * Extracted from AgentSession. Pure functions over explicitly-passed state.
 */

import type { AgentMessage } from "@astravia/agent-core";
import type { AssistantMessage, Model } from "@astravia/ai";
import { calculateContextTokens, estimateContextTokens } from "../compaction/index.js";
import type { ContextUsage } from "../extensions/index.js";
import { getLatestCompactionEntry, type SessionManager } from "../session-manager/index.js";

/** Session statistics for /session command */
export interface SessionStats {
	sessionFile: string | undefined;
	sessionId: string;
	userMessages: number;
	assistantMessages: number;
	toolCalls: number;
	toolResults: number;
	totalMessages: number;
	tokens: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
		total: number;
	};
	cost: number;
}

/** Extract concatenated text content from a message content payload. */
export function extractUserMessageText(content: string | Array<{ type: string; text?: string }>): string {
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.filter((c): c is { type: "text"; text: string } => c.type === "text")
			.map((c) => c.text)
			.join("");
	}
	return "";
}

/** Compute session statistics from the agent state messages. */
export function computeSessionStats(deps: {
	messages: AgentMessage[];
	sessionFile: string | undefined;
	sessionId: string;
}): SessionStats {
	const { messages } = deps;
	const userMessages = messages.filter((m) => m.role === "user").length;
	const assistantMessages = messages.filter((m) => m.role === "assistant").length;
	const toolResults = messages.filter((m) => m.role === "toolResult").length;

	let toolCalls = 0;
	let totalInput = 0;
	let totalOutput = 0;
	let totalCacheRead = 0;
	let totalCacheWrite = 0;
	let totalCost = 0;

	for (const message of messages) {
		if (message.role === "assistant") {
			const assistantMsg = message as AssistantMessage;
			toolCalls += assistantMsg.content.filter((c) => c.type === "toolCall").length;
			totalInput += assistantMsg.usage.input;
			totalOutput += assistantMsg.usage.output;
			totalCacheRead += assistantMsg.usage.cacheRead;
			totalCacheWrite += assistantMsg.usage.cacheWrite;
			totalCost += assistantMsg.usage.cost.total;
		}
	}

	return {
		sessionFile: deps.sessionFile,
		sessionId: deps.sessionId,
		userMessages,
		assistantMessages,
		toolCalls,
		toolResults,
		totalMessages: messages.length,
		tokens: {
			input: totalInput,
			output: totalOutput,
			cacheRead: totalCacheRead,
			cacheWrite: totalCacheWrite,
			total: totalInput + totalOutput + totalCacheRead + totalCacheWrite,
		},
		cost: totalCost,
	};
}

/** Estimate current context usage against the model's context window. */
export function computeContextUsage(deps: {
	model: Model<any> | undefined;
	messages: AgentMessage[];
	sessionManager: SessionManager;
}): ContextUsage | undefined {
	const { model, messages, sessionManager } = deps;
	if (!model) return undefined;

	const contextWindow = model.contextWindow ?? 0;
	if (contextWindow <= 0) return undefined;

	// No messages yet → 0% usage (system prompt is not counted here)
	if (messages.length === 0) {
		return { tokens: 0, contextWindow, percent: 0 };
	}

	// After compaction, the last assistant usage reflects pre-compaction context size.
	// We can only trust usage from an assistant that responded after the latest compaction.
	// If no such assistant exists, fall back to estimation rather than returning unknown.
	const branchEntries = sessionManager.getBranch();
	const latestCompaction = getLatestCompactionEntry(branchEntries);

	if (latestCompaction) {
		const compactionIndex = branchEntries.lastIndexOf(latestCompaction);
		let hasPostCompactionUsage = false;
		for (let i = branchEntries.length - 1; i > compactionIndex; i--) {
			const entry = branchEntries[i];
			if (entry.type === "message" && entry.message.role === "assistant") {
				const assistant = entry.message;
				if (assistant.stopReason !== "aborted" && assistant.stopReason !== "error") {
					const contextTokens = calculateContextTokens(assistant.usage);
					if (contextTokens > 0) {
						hasPostCompactionUsage = true;
					}
					break;
				}
			}
		}

		if (!hasPostCompactionUsage) {
			// No post-compaction usage yet — use estimation instead of returning null.
			// This avoids "usage unknown" after compaction until the next LLM response.
			const estimate = estimateContextTokens(messages);
			const percent = (estimate.tokens / contextWindow) * 100;
			return { tokens: estimate.tokens, contextWindow, percent };
		}
	}

	const estimate = estimateContextTokens(messages);
	const percent = (estimate.tokens / contextWindow) * 100;

	return {
		tokens: estimate.tokens,
		contextWindow,
		percent,
	};
}

/** Get the trimmed text content of the last (non-empty-aborted) assistant message. */
export function getLastAssistantText(messages: AgentMessage[]): string | undefined {
	const lastAssistant = messages
		.slice()
		.reverse()
		.find((m) => {
			if (m.role !== "assistant") return false;
			const msg = m as AssistantMessage;
			// Skip aborted messages with no content
			if (msg.stopReason === "aborted" && msg.content.length === 0) return false;
			return true;
		});

	if (!lastAssistant) return undefined;

	let text = "";
	for (const content of (lastAssistant as AssistantMessage).content) {
		if (content.type === "text") {
			text += content.text;
		}
	}

	return text.trim() || undefined;
}
