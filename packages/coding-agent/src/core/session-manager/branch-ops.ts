/**
 * 树导航 tip 解析、getTree、分支导出内容、memory-mode rollover 内容。
 *
 * 业务：
 * - /tree 与 desktop 分支切换需要 tip / siblings / 全树
 * - /fork 与 desktop export 需要 root→leaf 新文件内容
 * - ADR-0009 rollover 需要 compaction + kept tail 新链
 */

import { randomUUID } from "crypto";
import { join } from "path";
import {
	type CompactionEntry,
	CURRENT_SESSION_VERSION,
	type FileEntry,
	generateId,
	type LabelEntry,
	type SessionEntry,
	type SessionHeader,
	type SessionTreeNode,
} from "./session-model.js";

/** Direct children of parentId (null = roots). */
export function getChildrenOf(byId: Map<string, SessionEntry>, parentId: string | null): SessionEntry[] {
	const children: SessionEntry[] = [];
	for (const entry of byId.values()) {
		if (entry.parentId === parentId) {
			children.push(entry);
		}
	}
	return children;
}

/**
 * Walk from entryId following the newest child at each step until a leaf.
 * Used when switching branches to show the tip of that subtree.
 */
export function resolveSubtreeTip(byId: Map<string, SessionEntry>, entryId: string): string {
	if (!byId.has(entryId)) {
		throw new Error(`Entry ${entryId} not found`);
	}
	let tipId = entryId;
	for (;;) {
		const children = getChildrenOf(byId, tipId).filter((e) => e.type !== "label");
		if (children.length === 0) break;
		children.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
		tipId = children[children.length - 1]!.id;
	}
	return tipId;
}

/**
 * Tip of a single user turn: the user message plus its assistant/tool/custom
 * descendants, but **not** the next user message (or anything under it).
 *
 * Used by desktop fork: forking a user bubble keeps that prompt and the AI
 * reply for this turn, without later conversation turns.
 */
export function resolveUserTurnTip(byId: Map<string, SessionEntry>, userEntryId: string): string {
	const entry = byId.get(userEntryId);
	if (!entry || entry.type !== "message" || entry.message.role !== "user") {
		throw new Error(`Entry ${userEntryId} is not a user message`);
	}
	let tipId = userEntryId;
	for (;;) {
		const children = getChildrenOf(byId, tipId)
			.filter((e) => e.type !== "label")
			// Stop before the next user turn — do not walk into sibling/follow-up user messages.
			.filter((e) => !(e.type === "message" && e.message.role === "user"))
			.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
		if (children.length === 0) break;
		tipId = children[children.length - 1]!.id;
	}
	return tipId;
}

/** User-message siblings that share the same parent (for UI branch switchers). */
export function getUserMessageSiblings(byId: Map<string, SessionEntry>, entryId: string): SessionEntry[] {
	const entry = byId.get(entryId);
	if (!entry || entry.type !== "message" || entry.message.role !== "user") {
		return [];
	}
	return getChildrenOf(byId, entry.parentId)
		.filter((e) => e.type === "message" && e.message.role === "user")
		.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

/**
 * Build the session as a tree. Orphaned entries (broken parent chain) become roots.
 */
export function buildSessionTree(entries: SessionEntry[], labelsById: Map<string, string>): SessionTreeNode[] {
	const nodeMap = new Map<string, SessionTreeNode>();
	const roots: SessionTreeNode[] = [];

	for (const entry of entries) {
		const label = labelsById.get(entry.id);
		nodeMap.set(entry.id, { entry, children: [], label });
	}

	for (const entry of entries) {
		const node = nodeMap.get(entry.id)!;
		if (entry.parentId === null || entry.parentId === entry.id) {
			roots.push(node);
		} else {
			const parent = nodeMap.get(entry.parentId);
			if (parent) {
				parent.children.push(node);
			} else {
				roots.push(node);
			}
		}
	}

	const stack: SessionTreeNode[] = [...roots];
	while (stack.length > 0) {
		const node = stack.pop()!;
		node.children.sort((a, b) => new Date(a.entry.timestamp).getTime() - new Date(b.entry.timestamp).getTime());
		stack.push(...node.children);
	}

	return roots;
}

export interface ExportBranchContent {
	header: SessionHeader;
	pathWithoutLabels: SessionEntry[];
	labelEntries: LabelEntry[];
	newSessionFile: string;
}

/**
 * Build header + path entries for a branched session file without mutating the source.
 * `leafId === null` produces an empty conversation (header only).
 */
export function buildExportBranchContent(params: {
	leafId: string | null;
	pathWithoutLabels: SessionEntry[];
	labelsById: Map<string, string>;
	cwd: string;
	sessionDir: string;
	previousSessionFile: string | undefined;
	persist: boolean;
	parentEntryId?: string;
}): ExportBranchContent {
	const { leafId, pathWithoutLabels, labelsById, cwd, sessionDir, previousSessionFile, persist, parentEntryId } =
		params;

	if (leafId !== null && pathWithoutLabels.length === 0) {
		throw new Error(`Entry ${leafId} not found`);
	}

	const newSessionId = randomUUID();
	const timestamp = new Date().toISOString();
	const fileTimestamp = timestamp.replace(/[:.]/g, "-");
	const newSessionFile = join(sessionDir, `${fileTimestamp}_${newSessionId}.jsonl`);

	const header: SessionHeader = {
		type: "session",
		version: CURRENT_SESSION_VERSION,
		id: newSessionId,
		timestamp,
		cwd,
		parentSession: persist ? previousSessionFile : undefined,
		parentEntryId,
	};

	const pathEntryIds = new Set(pathWithoutLabels.map((e) => e.id));
	const labelsToWrite: Array<{ targetId: string; label: string }> = [];
	for (const [targetId, label] of labelsById) {
		if (pathEntryIds.has(targetId)) {
			labelsToWrite.push({ targetId, label });
		}
	}

	const labelEntries: LabelEntry[] = [];
	let parentId = pathWithoutLabels[pathWithoutLabels.length - 1]?.id || null;
	const usedIds = new Set(pathEntryIds);
	for (const { targetId, label } of labelsToWrite) {
		const labelEntry: LabelEntry = {
			type: "label",
			id: generateId(usedIds),
			parentId,
			timestamp: new Date().toISOString(),
			targetId,
			label,
		};
		usedIds.add(labelEntry.id);
		labelEntries.push(labelEntry);
		parentId = labelEntry.id;
	}

	return { header, pathWithoutLabels, labelEntries, newSessionFile };
}

/**
 * memory-mode rollover (ADR-0009): seed a new linear chain from compaction + kept tail.
 * Returns null when there is no compaction on the path.
 */
export function buildRolloverChain(path: SessionEntry[]): {
	newEntries: SessionEntry[];
} | null {
	let compactionIdx = -1;
	for (let i = path.length - 1; i >= 0; i--) {
		if (path[i].type === "compaction") {
			compactionIdx = i;
			break;
		}
	}
	if (compactionIdx === -1) return null;

	const compaction = path[compactionIdx] as CompactionEntry;

	const kept: SessionEntry[] = [];
	let foundFirstKept = false;
	for (let i = 0; i < compactionIdx; i++) {
		const e = path[i];
		if (e.id === compaction.firstKeptEntryId) foundFirstKept = true;
		if (foundFirstKept) kept.push(e);
	}
	for (let i = compactionIdx + 1; i < path.length; i++) kept.push(path[i]);

	const carried: SessionEntry[] = [compaction, ...kept];
	const newEntries: SessionEntry[] = [];
	let prevId: string | null = null;
	for (const e of carried) {
		newEntries.push({ ...e, parentId: prevId } as SessionEntry);
		prevId = e.id;
	}
	(newEntries[0] as CompactionEntry).firstKeptEntryId = kept.length > 0 ? kept[0].id : compaction.id;

	return { newEntries };
}

/** Write path for a new session file under sessionDir. */
export function newSessionFilePath(sessionDir: string, sessionId: string, timestampIso: string): string {
	const fileTimestamp = timestampIso.replace(/[:.]/g, "-");
	return join(sessionDir, `${fileTimestamp}_${sessionId}.jsonl`);
}

export function createForkHeader(params: {
	targetCwd: string;
	sourcePath: string;
	sessionId: string;
	timestamp: string;
}): SessionHeader {
	return {
		type: "session",
		version: CURRENT_SESSION_VERSION,
		id: params.sessionId,
		timestamp: params.timestamp,
		cwd: params.targetCwd,
		parentSession: params.sourcePath,
	};
}

/** Filter non-header entries for fork copy. */
export function nonHeaderEntries(sourceEntries: FileEntry[]): SessionEntry[] {
	return sourceEntries.filter((e): e is SessionEntry => e.type !== "session");
}
