/**
 * 会话树导航：查询 path/tree/tip、切换 leaf、写 branch_summary 与 label。
 *
 * 对应 /tree、desktop 分支切换、书签。跨文件 fork/export 见 session-fork。
 */

import {
	buildSessionTree,
	getChildrenOf,
	getUserMessageSiblings as getUserMessageSiblingsOf,
	resolveSubtreeTip as resolveSubtreeTipOf,
	resolveUserTurnTip as resolveUserTurnTipOf,
} from "./branch-ops.js";
import { buildSessionContext } from "./llm-context.js";
import {
	type BranchSummaryEntry,
	generateId,
	type LabelEntry,
	type SessionContext,
	type SessionEntry,
	type SessionTreeNode,
} from "./session-model.js";
import type { SessionStore } from "./session-store.js";

export function getChildren(store: SessionStore, parentId: string | null): SessionEntry[] {
	return getChildrenOf(store.byId, parentId);
}

export function resolveSubtreeTip(store: SessionStore, entryId: string): string {
	return resolveSubtreeTipOf(store.byId, entryId);
}

export function resolveUserTurnTip(store: SessionStore, userEntryId: string): string {
	return resolveUserTurnTipOf(store.byId, userEntryId);
}

export function getUserMessageSiblings(store: SessionStore, entryId: string): SessionEntry[] {
	return getUserMessageSiblingsOf(store.byId, entryId);
}

/** Walk from entry (or current leaf) to root. */
export function getBranch(store: SessionStore, fromId?: string): SessionEntry[] {
	const path: SessionEntry[] = [];
	const startId = fromId ?? store.leafId;
	let current = startId ? store.byId.get(startId) : undefined;
	while (current) {
		path.unshift(current);
		current = current.parentId ? store.byId.get(current.parentId) : undefined;
	}
	return path;
}

export function getTree(store: SessionStore): SessionTreeNode[] {
	return buildSessionTree(store.getEntries(), store.labelsById);
}

export function buildContext(store: SessionStore): SessionContext {
	return buildSessionContext(store.getEntries(), store.leafId, store.byId);
}

/** Move leaf to an earlier entry; next append forks a new branch. */
export function branch(store: SessionStore, branchFromId: string): void {
	if (!store.byId.has(branchFromId)) {
		throw new Error(`Entry ${branchFromId} not found`);
	}
	store.leafId = branchFromId;
}

/** Leaf before any entry (re-edit root user message). */
export function resetLeaf(store: SessionStore): void {
	store.leafId = null;
}

/**
 * Branch and append a summary of the abandoned path.
 * Returns the branch_summary entry id.
 */
export function branchWithSummary(
	store: SessionStore,
	branchFromId: string | null,
	summary: string,
	details?: unknown,
	fromHook?: boolean,
): string {
	if (branchFromId !== null && !store.byId.has(branchFromId)) {
		throw new Error(`Entry ${branchFromId} not found`);
	}
	store.leafId = branchFromId;
	const entry: BranchSummaryEntry = {
		type: "branch_summary",
		id: generateId(store.byId),
		parentId: branchFromId,
		timestamp: new Date().toISOString(),
		fromId: branchFromId ?? "root",
		summary,
		details,
		fromHook,
	};
	store.appendEntry(entry);
	return entry.id;
}

/** Set or clear a bookmark label on an entry. */
export function appendLabelChange(store: SessionStore, targetId: string, label: string | undefined): string {
	if (!store.byId.has(targetId)) {
		throw new Error(`Entry ${targetId} not found`);
	}
	const entry: LabelEntry = {
		type: "label",
		id: generateId(store.byId),
		parentId: store.leafId,
		timestamp: new Date().toISOString(),
		targetId,
		label,
	};
	store.appendEntry(entry);
	if (label) {
		store.labelsById.set(targetId, label);
	} else {
		store.labelsById.delete(targetId);
	}
	return entry.id;
}
