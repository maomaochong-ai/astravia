/**
 * 消息编辑：删除单条消息、替换当前支路最后一条 user 及其回复子树。
 *
 * 业务含义：破坏性编辑 transcript，需 reparent 子节点并修正
 * compaction.firstKeptEntryId / branch_summary.fromId 引用。
 */

import type { FileEntry, SessionEntry } from "./session-model.js";

export interface MessageEditState {
	fileEntries: FileEntry[];
	byId: Map<string, SessionEntry>;
	leafId: string | null;
}

function walkBranch(byId: Map<string, SessionEntry>, fromId: string | null): SessionEntry[] {
	const path: SessionEntry[] = [];
	let current = fromId ? byId.get(fromId) : undefined;
	while (current) {
		path.unshift(current);
		current = current.parentId ? byId.get(current.parentId) : undefined;
	}
	return path;
}

function rewriteAfterRemoval(
	fileEntries: FileEntry[],
	byId: Map<string, SessionEntry>,
	removedIds: Set<string>,
): { fileEntries: FileEntry[]; byId: Map<string, SessionEntry> } {
	const resolveSurvivingParent = (parentId: string | null): string | null => {
		let current = parentId;
		while (current && removedIds.has(current)) {
			current = byId.get(current)?.parentId ?? null;
		}
		return current;
	};

	const firstKeptReplacements = new Map<string, string>();
	for (const candidate of byId.values()) {
		if (candidate.type !== "compaction" || !removedIds.has(candidate.firstKeptEntryId)) continue;
		const path = walkBranch(byId, candidate.id);
		const removedIndex = path.findIndex((pathEntry) => removedIds.has(pathEntry.id));
		const replacement = path.slice(removedIndex + 1).find((pathEntry) => !removedIds.has(pathEntry.id));
		firstKeptReplacements.set(candidate.id, replacement?.id ?? candidate.id);
	}

	const nextEntries = fileEntries
		.filter((candidate) => candidate.type === "session" || !removedIds.has(candidate.id))
		.map((candidate): FileEntry => {
			if (candidate.type === "session") return candidate;
			let next: SessionEntry = candidate;
			const parentId = resolveSurvivingParent(candidate.parentId);
			if (parentId !== candidate.parentId) {
				next = { ...next, parentId } as SessionEntry;
			}
			const firstKeptEntryId = firstKeptReplacements.get(candidate.id);
			if (next.type === "compaction" && firstKeptEntryId) {
				next = { ...next, firstKeptEntryId };
			}
			if (next.type === "branch_summary" && removedIds.has(next.fromId)) {
				next = { ...next, fromId: resolveSurvivingParent(next.fromId) ?? "root" };
			}
			return next;
		});

	const nextById = new Map<string, SessionEntry>();
	for (const entry of nextEntries) {
		if (entry.type !== "session") {
			nextById.set(entry.id, entry);
		}
	}

	return { fileEntries: nextEntries, byId: nextById };
}

/**
 * Permanently delete one message while preserving its descendants.
 * Children are reparented to the deleted message's parent; label entries
 * targeting the message are removed with the same reparenting rule.
 */
export function deleteMessage(state: MessageEditState, entryId: string): MessageEditState {
	const entry = state.byId.get(entryId);
	if (!entry || entry.type !== "message") {
		throw new Error(`Entry ${entryId} is not a message`);
	}

	const removedIds = new Set<string>([entryId]);
	for (const candidate of state.byId.values()) {
		if (candidate.type === "label" && candidate.targetId === entryId) {
			removedIds.add(candidate.id);
		}
	}

	const resolveSurvivingParent = (parentId: string | null): string | null => {
		let current = parentId;
		while (current && removedIds.has(current)) {
			current = state.byId.get(current)?.parentId ?? null;
		}
		return current;
	};

	const { fileEntries, byId } = rewriteAfterRemoval(state.fileEntries, state.byId, removedIds);
	const previousLeafId = state.leafId;
	let leafId: string | null;
	if (previousLeafId && !removedIds.has(previousLeafId) && byId.has(previousLeafId)) {
		leafId = previousLeafId;
	} else {
		leafId = resolveSurvivingParent(previousLeafId);
	}

	return { fileEntries, byId, leafId };
}

/**
 * Remove the active branch's last user message and its entire reply subtree.
 * Leaf becomes that user's parent so the next append does not leave an alternate branch.
 */
export function replaceLastUserMessage(state: MessageEditState, entryId: string): MessageEditState {
	const entry = state.byId.get(entryId);
	if (!entry || entry.type !== "message" || entry.message.role !== "user") {
		throw new Error(`Entry ${entryId} is not a user message`);
	}

	const lastUserEntry = walkBranch(state.byId, state.leafId)
		.slice()
		.reverse()
		.find((candidate) => candidate.type === "message" && candidate.message.role === "user");
	if (lastUserEntry?.id !== entryId) {
		throw new Error(`Entry ${entryId} is not the last user message on the active branch`);
	}

	const childrenByParent = new Map<string, string[]>();
	for (const candidate of state.byId.values()) {
		if (candidate.parentId === null) continue;
		const children = childrenByParent.get(candidate.parentId) ?? [];
		children.push(candidate.id);
		childrenByParent.set(candidate.parentId, children);
	}
	const removedIds = new Set<string>();
	const stack = [entryId];
	while (stack.length > 0) {
		const current = stack.pop();
		if (!current || removedIds.has(current)) continue;
		removedIds.add(current);
		stack.push(...(childrenByParent.get(current) ?? []));
	}
	for (const candidate of state.byId.values()) {
		if (candidate.type === "label" && removedIds.has(candidate.targetId)) {
			removedIds.add(candidate.id);
		}
	}

	const { fileEntries, byId } = rewriteAfterRemoval(state.fileEntries, state.byId, removedIds);
	const leafId = entry.parentId && byId.has(entry.parentId) ? entry.parentId : null;
	return { fileEntries, byId, leafId };
}
