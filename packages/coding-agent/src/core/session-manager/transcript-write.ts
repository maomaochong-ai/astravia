/**
 * 对话记录写入：向当前 leaf 追加各类 session entry。
 *
 * 含消息、模型/thinking 变更、compaction、扩展 custom、命名、tool timing。
 * 不负责 leaf 切换（见 tree-navigation）与跨文件 fork（见 session-fork）。
 */

import type { ToolPhase } from "@astravia/agent-core";
import type { ImageContent, Message, TextContent } from "@astravia/ai";
import type { BashExecutionMessage, CustomMessage } from "../messages.js";
import {
	type CompactionEntry,
	type CustomEntry,
	type CustomMessageEntry,
	generateId,
	type ModelChangeEntry,
	type SessionInfoEntry,
	type SessionMessageEntry,
	type ThinkingLevelChangeEntry,
	type ToolTimingEntry,
} from "./session-model.js";
import type { SessionStore } from "./session-store.js";

/** Append a message as child of current leaf. Returns entry id. */
export function appendMessage(store: SessionStore, message: Message | CustomMessage | BashExecutionMessage): string {
	const entry: SessionMessageEntry = {
		type: "message",
		id: generateId(store.byId),
		parentId: store.leafId,
		timestamp: new Date().toISOString(),
		message,
	};
	store.appendEntry(entry);
	return entry.id;
}

export function appendThinkingLevelChange(store: SessionStore, thinkingLevel: string): string {
	const entry: ThinkingLevelChangeEntry = {
		type: "thinking_level_change",
		id: generateId(store.byId),
		parentId: store.leafId,
		timestamp: new Date().toISOString(),
		thinkingLevel,
	};
	store.appendEntry(entry);
	return entry.id;
}

/**
 * Tool timing is out-of-band metadata — never read by buildSessionContext.
 */
export function appendToolTiming(
	store: SessionStore,
	toolCallId: string,
	toolName: string,
	startedAt: number,
	durationMs: number,
	phases: ToolPhase[],
): string {
	const entry: ToolTimingEntry = {
		type: "tool_timing",
		id: generateId(store.byId),
		parentId: store.leafId,
		timestamp: new Date().toISOString(),
		toolCallId,
		toolName,
		startedAt,
		durationMs,
		phases,
	};
	store.appendEntry(entry);
	return entry.id;
}

export function appendModelChange(store: SessionStore, provider: string, modelId: string): string {
	const entry: ModelChangeEntry = {
		type: "model_change",
		id: generateId(store.byId),
		parentId: store.leafId,
		timestamp: new Date().toISOString(),
		provider,
		modelId,
	};
	store.appendEntry(entry);
	return entry.id;
}

export function appendCompaction<T = unknown>(
	store: SessionStore,
	summary: string,
	firstKeptEntryId: string,
	tokensBefore: number,
	details?: T,
	fromHook?: boolean,
): string {
	const entry: CompactionEntry<T> = {
		type: "compaction",
		id: generateId(store.byId),
		parentId: store.leafId,
		timestamp: new Date().toISOString(),
		summary,
		firstKeptEntryId,
		tokensBefore,
		details,
		fromHook,
	};
	store.appendEntry(entry);
	return entry.id;
}

export function appendCustomEntry(store: SessionStore, customType: string, data?: unknown): string {
	const entry: CustomEntry = {
		type: "custom",
		customType,
		data,
		id: generateId(store.byId),
		parentId: store.leafId,
		timestamp: new Date().toISOString(),
	};
	store.appendEntry(entry);
	return entry.id;
}

export function appendSessionInfo(store: SessionStore, name: string): string {
	const entry: SessionInfoEntry = {
		type: "session_info",
		id: generateId(store.byId),
		parentId: store.leafId,
		timestamp: new Date().toISOString(),
		name: name.trim(),
	};
	store.appendEntry(entry);
	return entry.id;
}

export function getSessionName(store: SessionStore): string | undefined {
	const entries = store.getEntries();
	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i];
		if (entry.type === "session_info" && entry.name) {
			return entry.name;
		}
	}
	return undefined;
}

export function appendCustomMessageEntry<T = unknown>(
	store: SessionStore,
	customType: string,
	content: string | (TextContent | ImageContent)[],
	display: boolean,
	details?: T,
): string {
	const entry: CustomMessageEntry<T> = {
		type: "custom_message",
		customType,
		content,
		display,
		details,
		id: generateId(store.byId),
		parentId: store.leafId,
		timestamp: new Date().toISOString(),
	};
	store.appendEntry(entry);
	return entry.id;
}
