/**
 * Agent event router.
 *
 * Extracted from AgentSession. Owns the per-turn index and last-assistant
 * tracking. Receives raw agent events, performs queue dequeue / ephemeral
 * filtering / extension fan-out / session persistence, then forwards to session
 * listeners and drives auto-retry + auto-compaction on agent_end.
 */

import type { AgentEvent, AgentMessage } from "@astravia/agent-core";
import type { AssistantMessage, Message, TextContent } from "@astravia/ai";
import type {
	MessageEndEvent,
	MessageStartEvent,
	MessageUpdateEvent,
	ToolExecutionEndEvent,
	ToolExecutionPhaseEvent,
	ToolExecutionStartEvent,
	ToolExecutionUpdateEvent,
	TurnEndEvent,
	TurnStartEvent,
} from "../extensions/index.js";
import { appendJournalLine } from "../memory/memory-journal.js";
import type { TodoStore } from "../todo-store.js";
import type { CompactionController } from "./compaction-controller.js";
import type { QueueController } from "./queue-controller.js";
import type { RetryController } from "./retry-controller.js";
import type { SessionContext } from "./session-context.js";

/**
 * Ephemeral message prefix. Messages starting with `[ephemeral:<tag>]` are
 * auto-injected by the system (e.g., todo continuation). They are visible to the
 * LLM but NOT persisted to session JSONL and NOT emitted to frontend/extensions.
 */
export const EPHEMERAL_PREFIX = "[ephemeral:";

export interface EventRouterDeps {
	todoStore: TodoStore;
	queue: QueueController;
	retry: RetryController;
	compaction: CompactionController;
}

export class EventRouter {
	private _lastAssistantMessage: AssistantMessage | undefined = undefined;
	private _turnIndex = 0;

	constructor(
		private readonly ctx: SessionContext,
		private readonly deps: EventRouterDeps,
	) {}

	/** Internal handler for agent events - shared by subscribe and reconnect. */
	handle = async (event: AgentEvent): Promise<void> => {
		// Re-emit todo state on agent_start so the UI picks it up reliably.
		// Todos created by the host before a run fire before the agent's event stream is
		// active; re-emitting here ensures the renderer receives them alongside the
		// normal lifecycle events.
		if (event.type === "agent_start") {
			const todoItems = this.deps.todoStore.getAll();
			if (todoItems.length > 0) {
				this.ctx.emit({ type: "todo_update", items: [...todoItems] });
			}
		}

		// When a user message starts, check if it's from either queue and remove it BEFORE emitting
		// This ensures the UI sees the updated queue state
		if (event.type === "message_start" && event.message.role === "user") {
			this.deps.queue.onUserMessageDelivered(this.getUserMessageText(event.message));
		}

		// Skip ephemeral messages (e.g., [ephemeral:todo]) —
		// they are only visible to the LLM, not persisted or sent to UI/extensions.
		if ((event.type === "message_start" || event.type === "message_end") && this.isEphemeralMessage(event.message)) {
			return;
		}

		// Emit to extensions first
		await this.emitExtensionEvent(event);

		// Notify all listeners
		this.ctx.emit(event);

		// Persist tool timing as an out-of-band SessionEntry. Kept separate from
		// SessionMessageEntry so it never enters LLM context — providers only
		// serialize message-type entries. See ADR 0001.
		if (event.type === "tool_execution_end") {
			this.ctx.sessionManager.appendToolTiming(
				event.toolCallId,
				event.toolName,
				event.startedAt,
				event.durationMs,
				event.phases,
			);
		}

		// Handle session persistence
		if (event.type === "message_end") {
			// Check if this is a custom message from extensions
			if (event.message.role === "custom") {
				// Persist as CustomMessageEntry
				this.ctx.sessionManager.appendCustomMessageEntry(
					event.message.customType,
					event.message.content,
					event.message.display,
					event.message.details,
				);
			} else if (
				event.message.role === "user" ||
				event.message.role === "assistant" ||
				event.message.role === "toolResult"
			) {
				// Regular LLM message - persist as SessionMessageEntry
				this.ctx.sessionManager.appendMessage(event.message);
			}
			// Other message types (bashExecution, compactionSummary, branchSummary) are persisted elsewhere

			// Track assistant message for auto-compaction (checked on agent_end)
			if (event.message.role === "assistant") {
				this._lastAssistantMessage = event.message;

				// Reset retry counter immediately on successful assistant response
				// This prevents accumulation across multiple LLM calls within a turn
				const assistantMsg = event.message as AssistantMessage;
				if (assistantMsg.stopReason !== "error") {
					this.deps.retry.notifySuccess();
				}
			}
		}

		// Check auto-retry and auto-compaction after agent completes
		if (event.type === "agent_end" && this._lastAssistantMessage) {
			const msg = this._lastAssistantMessage;
			this._lastAssistantMessage = undefined;

			// Check for retryable errors first (overloaded, rate limit, server errors)
			if (this.deps.retry.isRetryableError(msg)) {
				const didRetry = await this.deps.retry.handleRetryableError(msg);
				if (didRetry) return; // Retry was initiated, don't proceed to compaction
			}

			// memory-mode (ADR-0009): record a one-line digest of this turn in
			// today's JOURNAL.md before any rollover. Best-effort, run cwd = date dir.
			if (this.ctx.memoryMode) {
				appendJournalLine(this.ctx.cwd, msg);
			}

			await this.deps.compaction.checkCompaction(msg);
		}
	};

	/** Check if a message is ephemeral (should not be persisted or shown). */
	private isEphemeralMessage(message: AgentMessage): boolean {
		if (message.role !== "user") return false;
		const content = message.content;
		if (typeof content === "string") return content.startsWith(EPHEMERAL_PREFIX);
		if (Array.isArray(content) && content.length > 0 && content[0].type === "text") {
			return content[0].text.startsWith(EPHEMERAL_PREFIX);
		}
		return false;
	}

	/** Extract text content from a message. */
	private getUserMessageText(message: Message): string {
		if (message.role !== "user") return "";
		const content = message.content;
		if (typeof content === "string") return content;
		const textBlocks = content.filter((c) => c.type === "text");
		return textBlocks.map((c) => (c as TextContent).text).join("");
	}

	/** Emit extension events based on agent events. */
	private async emitExtensionEvent(event: AgentEvent): Promise<void> {
		const runner = this.ctx.extensionRunner;
		if (!runner) return;

		if (event.type === "agent_start") {
			this._turnIndex = 0;
			await runner.emit({ type: "agent_start" });
		} else if (event.type === "agent_end") {
			await runner.emit({ type: "agent_end", messages: event.messages });
		} else if (event.type === "turn_start") {
			const extensionEvent: TurnStartEvent = {
				type: "turn_start",
				turnIndex: this._turnIndex,
				timestamp: Date.now(),
			};
			await runner.emit(extensionEvent);
		} else if (event.type === "turn_end") {
			const extensionEvent: TurnEndEvent = {
				type: "turn_end",
				turnIndex: this._turnIndex,
				message: event.message,
				toolResults: event.toolResults,
			};
			await runner.emit(extensionEvent);
			this._turnIndex++;
		} else if (event.type === "message_start") {
			const extensionEvent: MessageStartEvent = {
				type: "message_start",
				message: event.message,
			};
			await runner.emit(extensionEvent);
		} else if (event.type === "message_update") {
			const extensionEvent: MessageUpdateEvent = {
				type: "message_update",
				message: event.message,
				assistantMessageEvent: event.assistantMessageEvent,
			};
			await runner.emit(extensionEvent);
		} else if (event.type === "message_end") {
			const extensionEvent: MessageEndEvent = {
				type: "message_end",
				message: event.message,
			};
			await runner.emit(extensionEvent);
		} else if (event.type === "tool_execution_start") {
			const extensionEvent: ToolExecutionStartEvent = {
				type: "tool_execution_start",
				toolCallId: event.toolCallId,
				toolName: event.toolName,
				args: event.args,
				startedAt: event.startedAt,
			};
			await runner.emit(extensionEvent);
		} else if (event.type === "tool_execution_update") {
			const extensionEvent: ToolExecutionUpdateEvent = {
				type: "tool_execution_update",
				toolCallId: event.toolCallId,
				toolName: event.toolName,
				args: event.args,
				partialResult: event.partialResult,
			};
			await runner.emit(extensionEvent);
		} else if (event.type === "tool_execution_phase") {
			const extensionEvent: ToolExecutionPhaseEvent = {
				type: "tool_execution_phase",
				toolCallId: event.toolCallId,
				toolName: event.toolName,
				label: event.label,
				atMs: event.atMs,
			};
			await runner.emit(extensionEvent);
		} else if (event.type === "tool_execution_end") {
			const extensionEvent: ToolExecutionEndEvent = {
				type: "tool_execution_end",
				toolCallId: event.toolCallId,
				toolName: event.toolName,
				result: event.result,
				isError: event.isError,
				startedAt: event.startedAt,
				durationMs: event.durationMs,
				phases: event.phases,
			};
			await runner.emit(extensionEvent);
		}
	}
}
