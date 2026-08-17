import type { PromptRequest } from "@astravia/runtime-core";
import { atom } from "jotai";

export interface QueuedMessage {
	id: string;
	request: PromptRequest;
	displayText: string;
}

/**
 * streaming 期间排队的消息，按 session 的 runtimeId 隔离。
 * 纯内存，无持久化，app 重启清空。
 * Map<runtimeId, QueuedMessage[]>
 */
export const messageQueueBySessionAtom = atom<Map<string, QueuedMessage[]>>(new Map());

export function getQueueForSession(
	map: Map<string, QueuedMessage[]>,
	runtimeId: string | null | undefined,
): QueuedMessage[] {
	if (!runtimeId) return [];
	return map.get(runtimeId) ?? [];
}

export const enqueueMessageAtom = atom(
	null,
	(get, set, { runtimeId, item }: { runtimeId: string; item: QueuedMessage }) => {
		const prev = get(messageQueueBySessionAtom);
		const next = new Map(prev);
		next.set(runtimeId, [...(prev.get(runtimeId) ?? []), item]);
		set(messageQueueBySessionAtom, next);
	},
);

export const dequeueHeadAtom = atom(null, (get, set, runtimeId: string): QueuedMessage | null => {
	const prev = get(messageQueueBySessionAtom);
	const queue = prev.get(runtimeId);
	if (!queue || queue.length === 0) return null;
	const [head, ...rest] = queue;
	const next = new Map(prev);
	if (rest.length === 0) next.delete(runtimeId);
	else next.set(runtimeId, rest);
	set(messageQueueBySessionAtom, next);
	return head;
});

export const removeQueuedMessageAtom = atom(null, (get, set, { runtimeId, id }: { runtimeId: string; id: string }) => {
	const prev = get(messageQueueBySessionAtom);
	const queue = prev.get(runtimeId);
	if (!queue) return;
	const rest = queue.filter((item) => item.id !== id);
	const next = new Map(prev);
	if (rest.length === 0) next.delete(runtimeId);
	else next.set(runtimeId, rest);
	set(messageQueueBySessionAtom, next);
});

export const setQueueForSessionAtom = atom(
	null,
	(get, set, { runtimeId, items }: { runtimeId: string; items: QueuedMessage[] }) => {
		const prev = get(messageQueueBySessionAtom);
		const next = new Map(prev);
		if (items.length === 0) next.delete(runtimeId);
		else next.set(runtimeId, items);
		set(messageQueueBySessionAtom, next);
	},
);

/**
 * 队列派发序号：每当「立即发送 / 自然出队」把一条排队消息作为新一轮 prompt 真正发出时 +1。
 *
 * agent_end 会异步 getFullHistory 后整体替换消息列表以回填 entryId。但当某回合结束的同一
 * 时机（或结束后）发生了队列派发，这个整体替换就「跨到了下一轮」：mapped 可能已含下一条
 * 用户消息（→ 与乐观气泡重复），也可能尚不含（→ 冲掉乐观气泡并令 draft 串台）。
 *
 * 判活办法：每轮在 agent_start 记录当时序号；该轮 agent_end 的重拉落地时若序号已变，说明
 * 发生过队列派发 → 跳过这次过期替换，交由下一轮自己的 agent_end 在无重叠时安全重拉。
 * 纯内存，按 runtimeId 隔离，app 重启清空。
 */
const queuedDispatchSeqBySession = new Map<string, number>();

export function bumpQueuedDispatchSeq(runtimeId: string): void {
	queuedDispatchSeqBySession.set(runtimeId, (queuedDispatchSeqBySession.get(runtimeId) ?? 0) + 1);
}

export function getQueuedDispatchSeq(runtimeId: string): number {
	return queuedDispatchSeqBySession.get(runtimeId) ?? 0;
}

export const clearQueueAtom = atom(null, (get, set, runtimeId: string) => {
	const prev = get(messageQueueBySessionAtom);
	if (!prev.has(runtimeId)) return;
	const next = new Map(prev);
	next.delete(runtimeId);
	set(messageQueueBySessionAtom, next);
});
