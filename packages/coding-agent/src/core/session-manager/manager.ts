/**
 * SessionManager 公共门面。
 *
 * 自身只持有 SessionStore，并把调用委托到业务模块：
 * - session-lifecycle：新建/打开/切换
 * - transcript-write：对话写入
 * - tree-navigation：树查询与 leaf 切换
 * - message-edit：消息删除/替换
 * - session-fork：export / fork / rollover
 * - session-catalog：列表
 * - llm-context：经 tree-navigation.buildContext
 */

import type { ToolPhase } from "@astravia/agent-core";
import type { ImageContent, Message, TextContent } from "@astravia/ai";
import type { BashExecutionMessage, CustomMessage } from "../messages.js";
import {
	deleteMessage as applyDeleteMessage,
	replaceLastUserMessage as applyReplaceLastUserMessage,
} from "./message-edit.js";
import { listAllSessions, listSessions, type SessionListProgress } from "./session-catalog.js";
import {
	createBranchedSession as forkCreateBranched,
	exportBranchToNewFile as forkExportBranch,
	rolloverToNewFile as forkRollover,
	writeForkedSessionFile,
} from "./session-fork.js";
import {
	initializeStore,
	newSession as lifecycleNewSession,
	setSessionFile as lifecycleSetSessionFile,
	resolveContinueRecentArgs,
	resolveCreateArgs,
	resolveInMemoryArgs,
	resolveOpenArgs,
	type SessionOpenArgs,
} from "./session-lifecycle.js";
import type {
	NewSessionOptions,
	SessionContext,
	SessionEntry,
	SessionHeader,
	SessionInfo,
	SessionTreeNode,
} from "./session-model.js";
import { SessionStore } from "./session-store.js";
import * as transcript from "./transcript-write.js";
import * as tree from "./tree-navigation.js";

/**
 * Manages conversation sessions as trees stored in JSONL files.
 *
 * Each session entry has an id and parentId forming a tree structure. The "leaf"
 * pointer tracks the current position. Appending creates a child of the current leaf.
 * Branching moves the leaf to an earlier entry, allowing new branches without
 * modifying history.
 *
 * Use buildSessionContext() to get the resolved message list for the LLM.
 */
export class SessionManager {
	private readonly store: SessionStore;

	private constructor(store: SessionStore) {
		this.store = store;
	}

	private static fromArgs(args: SessionOpenArgs): SessionManager {
		const store = new SessionStore(args.cwd, args.sessionDir, args.persist);
		initializeStore(store, args.sessionFile, args.options);
		return new SessionManager(store);
	}

	// --- lifecycle ---

	setSessionFile(sessionFile: string): void {
		lifecycleSetSessionFile(this.store, sessionFile);
	}

	newSession(options?: NewSessionOptions): string | undefined {
		return lifecycleNewSession(this.store, options);
	}

	close(): void {
		this.store.close();
	}

	// --- identity / persistence flags ---

	isPersisted(): boolean {
		return this.store.isPersisted();
	}

	getCwd(): string {
		return this.store.getCwd();
	}

	getSessionDir(): string {
		return this.store.getSessionDir();
	}

	getSessionId(): string {
		return this.store.getSessionId();
	}

	getSessionFile(): string | undefined {
		return this.store.getSessionFile();
	}

	/** @internal deferred JSONL flush; kept public for historical callers */
	_persist(entry: SessionEntry): void {
		this.store.persistEntry(entry);
	}

	// --- transcript write ---

	appendMessage(message: Message | CustomMessage | BashExecutionMessage): string {
		return transcript.appendMessage(this.store, message);
	}

	appendThinkingLevelChange(thinkingLevel: string): string {
		return transcript.appendThinkingLevelChange(this.store, thinkingLevel);
	}

	appendToolTiming(
		toolCallId: string,
		toolName: string,
		startedAt: number,
		durationMs: number,
		phases: ToolPhase[],
	): string {
		return transcript.appendToolTiming(this.store, toolCallId, toolName, startedAt, durationMs, phases);
	}

	appendModelChange(provider: string, modelId: string): string {
		return transcript.appendModelChange(this.store, provider, modelId);
	}

	appendCompaction<T = unknown>(
		summary: string,
		firstKeptEntryId: string,
		tokensBefore: number,
		details?: T,
		fromHook?: boolean,
	): string {
		return transcript.appendCompaction(this.store, summary, firstKeptEntryId, tokensBefore, details, fromHook);
	}

	appendCustomEntry(customType: string, data?: unknown): string {
		return transcript.appendCustomEntry(this.store, customType, data);
	}

	appendSessionInfo(name: string): string {
		return transcript.appendSessionInfo(this.store, name);
	}

	getSessionName(): string | undefined {
		return transcript.getSessionName(this.store);
	}

	appendCustomMessageEntry<T = unknown>(
		customType: string,
		content: string | (TextContent | ImageContent)[],
		display: boolean,
		details?: T,
	): string {
		return transcript.appendCustomMessageEntry(this.store, customType, content, display, details);
	}

	// --- tree read / navigate ---

	getLeafId(): string | null {
		return this.store.getLeafId();
	}

	getLeafEntry(): SessionEntry | undefined {
		return this.store.getLeafEntry();
	}

	getEntry(id: string): SessionEntry | undefined {
		return this.store.getEntry(id);
	}

	getLabel(id: string): string | undefined {
		return this.store.getLabel(id);
	}

	getHeader(): SessionHeader | null {
		return this.store.getHeader();
	}

	getEntries(): SessionEntry[] {
		return this.store.getEntries();
	}

	getChildren(parentId: string | null): SessionEntry[] {
		return tree.getChildren(this.store, parentId);
	}

	resolveSubtreeTip(entryId: string): string {
		return tree.resolveSubtreeTip(this.store, entryId);
	}

	resolveUserTurnTip(userEntryId: string): string {
		return tree.resolveUserTurnTip(this.store, userEntryId);
	}

	getUserMessageSiblings(entryId: string): SessionEntry[] {
		return tree.getUserMessageSiblings(this.store, entryId);
	}

	getBranch(fromId?: string): SessionEntry[] {
		return tree.getBranch(this.store, fromId);
	}

	getTree(): SessionTreeNode[] {
		return tree.getTree(this.store);
	}

	buildSessionContext(): SessionContext {
		return tree.buildContext(this.store);
	}

	branch(branchFromId: string): void {
		tree.branch(this.store, branchFromId);
	}

	resetLeaf(): void {
		tree.resetLeaf(this.store);
	}

	branchWithSummary(branchFromId: string | null, summary: string, details?: unknown, fromHook?: boolean): string {
		return tree.branchWithSummary(this.store, branchFromId, summary, details, fromHook);
	}

	appendLabelChange(targetId: string, label: string | undefined): string {
		return tree.appendLabelChange(this.store, targetId, label);
	}

	// --- message edit ---

	deleteMessage(entryId: string): { leafId: string | null } {
		const next = applyDeleteMessage(this.store.editStateSnapshot(), entryId);
		this.store.applyEditState(next);
		return { leafId: this.store.leafId };
	}

	replaceLastUserMessage(entryId: string): { leafId: string | null } {
		const next = applyReplaceLastUserMessage(this.store.editStateSnapshot(), entryId);
		this.store.applyEditState(next);
		return { leafId: this.store.leafId };
	}

	// --- fork / export / rollover ---

	rolloverToNewFile(): { from: string | undefined; to: string | undefined } {
		return forkRollover(this.store);
	}

	exportBranchToNewFile(leafId: string | null, options?: { parentEntryId?: string }): string | undefined {
		return forkExportBranch(this.store, leafId, options);
	}

	createBranchedSession(leafId: string): string | undefined {
		return forkCreateBranched(this.store, leafId);
	}

	// --- factories ---

	static create(cwd: string, sessionDir?: string, options?: NewSessionOptions): SessionManager {
		return SessionManager.fromArgs(resolveCreateArgs(cwd, sessionDir, options));
	}

	static open(path: string, sessionDir?: string, options?: NewSessionOptions): SessionManager {
		return SessionManager.fromArgs(resolveOpenArgs(path, sessionDir, options));
	}

	static continueRecent(cwd: string, sessionDir?: string): SessionManager {
		return SessionManager.fromArgs(resolveContinueRecentArgs(cwd, sessionDir));
	}

	static inMemory(cwd: string = process.cwd()): SessionManager {
		return SessionManager.fromArgs(resolveInMemoryArgs(cwd));
	}

	static forkFrom(sourcePath: string, targetCwd: string, sessionDir?: string): SessionManager {
		const { targetCwd: cwd, dir, newSessionFile } = writeForkedSessionFile(sourcePath, targetCwd, sessionDir);
		return SessionManager.fromArgs({
			cwd,
			sessionDir: dir,
			sessionFile: newSessionFile,
			persist: true,
		});
	}

	static async list(cwd: string, sessionDir?: string, onProgress?: SessionListProgress): Promise<SessionInfo[]> {
		return listSessions(cwd, sessionDir, onProgress);
	}

	static async listAll(onProgress?: SessionListProgress): Promise<SessionInfo[]> {
		return listAllSessions(onProgress);
	}
}

export type ReadonlySessionManager = Pick<
	SessionManager,
	| "getCwd"
	| "getSessionDir"
	| "getSessionId"
	| "getSessionFile"
	| "getLeafId"
	| "getLeafEntry"
	| "getEntry"
	| "getLabel"
	| "getBranch"
	| "getHeader"
	| "getEntries"
	| "getTree"
	| "getSessionName"
>;
