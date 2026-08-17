import { randomUUID } from "node:crypto";
import type { Message } from "@astravia/ai";
import type { AgentSession, AgentSessionEvent } from "@astravia/coding-agent";
import type { SessionEvent, SessionEventBase } from "../contracts.js";
import { runtimeError } from "../errors.js";
import { ASSISTANT_TURN_TIMING_TYPE, extractAssistantText } from "./history.js";

export function baseSessionEvent(
	sessionId: string,
	source: SessionEventBase["source"],
	timestamp = Date.now(),
): SessionEventBase {
	return {
		schemaVersion: 1,
		sessionId,
		eventId: randomUUID(),
		timestamp,
		source,
	};
}

export function lifecycleSessionEvent(
	sessionId: string,
	phase: "created" | "agent_start" | "turn_start" | "turn_end" | "agent_end" | "aborted",
	timestamp?: number,
): SessionEvent {
	return {
		...baseSessionEvent(sessionId, "runtime-core", timestamp),
		type: "session.lifecycle",
		phase,
	};
}

export type MapAgentEventState = {
	/** 当前回合 start 时间；agent_start 写入，agent_end 消费后清除。 */
	currentTurnStartedAt: Map<string, number>;
};

/**
 * 将 coding-agent AgentSessionEvent 映射为宿主 SessionEvent[]。
 * 副作用仅限回合计时 Map（与 persistAssistantTurnTiming 落盘）。
 */
export function mapAgentSessionEvent(
	sessionId: string,
	event: AgentSessionEvent,
	session: AgentSession,
	state: MapAgentEventState,
): SessionEvent[] {
	const events: SessionEvent[] = [];

	if (event.type === "agent_start") {
		const startedAt = Date.now();
		state.currentTurnStartedAt.set(sessionId, startedAt);
		events.push(lifecycleSessionEvent(sessionId, "agent_start", startedAt));
		return events;
	}

	if (event.type === "turn_start") {
		events.push(lifecycleSessionEvent(sessionId, "turn_start"));
		return events;
	}

	if (event.type === "turn_end") {
		events.push(lifecycleSessionEvent(sessionId, "turn_end"));
		return events;
	}

	if (event.type === "agent_end") {
		const endedAt = Date.now();
		persistAssistantTurnTiming(sessionId, session, endedAt, state.currentTurnStartedAt);
		events.push(lifecycleSessionEvent(sessionId, "agent_end", endedAt));
		return events;
	}

	if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
		events.push({
			...baseSessionEvent(sessionId, "agent"),
			type: "message.delta",
			delta: event.assistantMessageEvent.delta,
		});
		return events;
	}

	if (event.type === "message_update" && event.assistantMessageEvent.type === "thinking_delta") {
		events.push({
			...baseSessionEvent(sessionId, "agent"),
			type: "thinking.delta",
			delta: event.assistantMessageEvent.delta,
		});
		return events;
	}

	if (event.type === "message_update" && event.assistantMessageEvent.type === "toolcall_start") {
		const partial = event.assistantMessageEvent.partial;
		const contentIndex = event.assistantMessageEvent.contentIndex;
		const toolContent = partial?.content?.[contentIndex];
		if (toolContent && toolContent.type === "toolCall") {
			events.push({
				...baseSessionEvent(sessionId, "agent"),
				type: "toolcall.start",
				toolCallId: String(toolContent.id ?? ""),
				toolName: String(toolContent.name ?? ""),
			});
		}
		return events;
	}

	if (event.type === "message_end" && event.message.role === "assistant") {
		events.push({
			...baseSessionEvent(sessionId, "agent"),
			type: "message.final",
			message: event.message as Message,
		});

		const contextUsage = session.getContextUsage();
		events.push({
			...baseSessionEvent(sessionId, "agent"),
			type: "usage.update",
			input: event.message.usage.input,
			output: event.message.usage.output,
			cacheRead: event.message.usage.cacheRead,
			cacheWrite: event.message.usage.cacheWrite,
			costTotal: event.message.usage.cost.total,
			contextPercent: contextUsage?.percent ?? null,
			contextWindow: contextUsage?.contextWindow ?? 0,
		});

		if (event.message.stopReason === "error") {
			const errorText =
				extractAssistantText(event.message.content) ||
				(event.message as Message & { errorMessage?: string }).errorMessage ||
				"Assistant response ended with error";
			console.error(`[RuntimeHost.event] session=${sessionId} type=assistant_error message=${errorText}`);
			events.push({
				...baseSessionEvent(sessionId, "agent"),
				type: "error",
				error: runtimeError("INTERNAL_ERROR", errorText, true, "provider"),
			});
		} else if (event.message.stopReason === "aborted") {
			console.warn(`[RuntimeHost.event] session=${sessionId} type=aborted`);
			const endedAt = Date.now();
			events.push(lifecycleSessionEvent(sessionId, "aborted", endedAt));
		}
		// NOTE: Do NOT emit agent_end here. In a multi-turn agent loop,
		// message_end fires after each LLM call, not just the final one.
		// The real agent_end comes from the "agent_end" session event.
		return events;
	}

	if (event.type === "tool_execution_start") {
		events.push({
			...baseSessionEvent(sessionId, "tool"),
			type: "tool.start",
			toolCallId: event.toolCallId,
			toolName: event.toolName,
			args: event.args,
			startedAt: event.startedAt,
		});
		return events;
	}

	if (event.type === "tool_execution_update") {
		events.push({
			...baseSessionEvent(sessionId, "tool"),
			type: "tool.update",
			toolCallId: event.toolCallId,
			toolName: event.toolName,
			partialResult: event.partialResult,
		});
		return events;
	}

	if (event.type === "tool_execution_phase") {
		events.push({
			...baseSessionEvent(sessionId, "tool"),
			type: "tool.phase",
			toolCallId: event.toolCallId,
			toolName: event.toolName,
			label: event.label,
			atMs: event.atMs,
		});
		return events;
	}

	if (event.type === "tool_execution_end") {
		events.push({
			...baseSessionEvent(sessionId, "tool"),
			type: "tool.end",
			toolCallId: event.toolCallId,
			toolName: event.toolName,
			isError: event.isError,
			result: event.result,
			startedAt: event.startedAt,
			durationMs: event.durationMs,
			phases: event.phases,
		});
		return events;
	}

	if (event.type === "auto_retry_start") {
		console.warn(
			`[RuntimeHost.event] session=${sessionId} type=auto_retry_start attempt=${event.attempt}/${event.maxAttempts} delayMs=${event.delayMs} message=${event.errorMessage}`,
		);
		events.push({
			...baseSessionEvent(sessionId, "agent"),
			type: "error",
			error: runtimeError("INTERNAL_ERROR", event.errorMessage, true, "provider"),
		});
		return events;
	}

	if (event.type === "todo_update") {
		events.push({
			...baseSessionEvent(sessionId, "agent"),
			type: "todo_update",
			items: event.items as any[],
		});
		return events;
	}

	if (event.type === "background_tasks_update") {
		events.push({
			...baseSessionEvent(sessionId, "agent"),
			type: "background_tasks_update",
			tasks: event.tasks as any[],
		});
		return events;
	}

	if (event.type === "subagents_update") {
		events.push({
			...baseSessionEvent(sessionId, "agent"),
			type: "subagents_update",
			agents: event.agents as any[],
		});
		return events;
	}

	if (event.type === "auto_compaction_start") {
		events.push({
			...baseSessionEvent(sessionId, "agent"),
			type: "compaction.start",
			reason: event.reason,
		});
		return events;
	}

	if (event.type === "mcp_reload_start") {
		events.push({
			...baseSessionEvent(sessionId, "agent"),
			type: "mcp.reload.start",
		});
		return events;
	}

	if (event.type === "mcp_reload_end") {
		events.push({
			...baseSessionEvent(sessionId, "agent"),
			type: "mcp.reload.end",
			changed: event.changed,
			errorMessage: event.errorMessage,
		});
		return events;
	}

	if (event.type === "auto_compaction_end") {
		events.push({
			...baseSessionEvent(sessionId, "agent"),
			type: "compaction.end",
			success: !!event.result && !event.aborted,
			errorMessage: event.errorMessage,
		});
		return events;
	}

	return events;
}

export function persistAssistantTurnTiming(
	sessionId: string,
	session: AgentSession,
	endedAt: number,
	currentTurnStartedAt: Map<string, number>,
): void {
	const startedAt = currentTurnStartedAt.get(sessionId);
	if (!startedAt) return;
	currentTurnStartedAt.delete(sessionId);
	session.sessionManager.appendCustomEntry(ASSISTANT_TURN_TIMING_TYPE, {
		startedAt,
		endedAt,
		durationMs: Math.max(0, endedAt - startedAt),
	});
}
