/**
 * 会话内存态与 JSONL 落盘原语。
 *
 * 业务文件（lifecycle / transcript / tree / fork / edit）共享同一 store，
 * 不在此堆积产品行为——只负责 entries 索引、leaf、锁与 flush 策略。
 */

import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { acquireSessionLock, type SessionLockHandle } from "../session-lock.js";
import type { MessageEditState } from "./message-edit.js";
import type { FileEntry, SessionEntry, SessionHeader } from "./session-model.js";

export class SessionStore {
	sessionId = "";
	sessionFile: string | undefined;
	sessionDir: string;
	cwd: string;
	persist: boolean;
	/** False until first assistant flush (or full rewrite). */
	flushed = false;
	/**
	 * Header written eagerly so external listers see the file before body flush.
	 * First body flush skips duplicating the header when true.
	 */
	headerOnDisk = false;
	fileEntries: FileEntry[] = [];
	byId = new Map<string, SessionEntry>();
	labelsById = new Map<string, string>();
	leafId: string | null = null;
	lockHandle?: SessionLockHandle;

	constructor(cwd: string, sessionDir: string, persist: boolean) {
		this.cwd = cwd;
		this.sessionDir = sessionDir;
		this.persist = persist;
		if (persist && sessionDir && !existsSync(sessionDir)) {
			mkdirSync(sessionDir, { recursive: true });
		}
	}

	isPersisted(): boolean {
		return this.persist;
	}

	getCwd(): string {
		return this.cwd;
	}

	getSessionDir(): string {
		return this.sessionDir;
	}

	getSessionId(): string {
		return this.sessionId;
	}

	getSessionFile(): string | undefined {
		return this.sessionFile;
	}

	getLeafId(): string | null {
		return this.leafId;
	}

	getLeafEntry(): SessionEntry | undefined {
		return this.leafId ? this.byId.get(this.leafId) : undefined;
	}

	getEntry(id: string): SessionEntry | undefined {
		return this.byId.get(id);
	}

	getLabel(id: string): string | undefined {
		return this.labelsById.get(id);
	}

	getHeader(): SessionHeader | null {
		const h = this.fileEntries.find((e) => e.type === "session");
		return h ? (h as SessionHeader) : null;
	}

	getEntries(): SessionEntry[] {
		return this.fileEntries.filter((e): e is SessionEntry => e.type !== "session");
	}

	rebuildIndex(): void {
		this.byId.clear();
		this.labelsById.clear();
		this.leafId = null;
		for (const entry of this.fileEntries) {
			if (entry.type === "session") continue;
			this.byId.set(entry.id, entry);
			this.leafId = entry.id;
			if (entry.type === "label") {
				if (entry.label) {
					this.labelsById.set(entry.targetId, entry.label);
				} else {
					this.labelsById.delete(entry.targetId);
				}
			}
		}
	}

	/**
	 * Apply destructive edit result: replace entries/index, rebuild labels from byId, rewrite file.
	 */
	applyEditState(next: MessageEditState): void {
		this.fileEntries = next.fileEntries;
		this.byId = next.byId;
		this.labelsById.clear();
		for (const entry of this.byId.values()) {
			if (entry.type === "label" && entry.label) {
				this.labelsById.set(entry.targetId, entry.label);
			}
		}
		this.leafId = next.leafId;
		this.rewriteFile();
		this.flushed = true;
	}

	editStateSnapshot(): MessageEditState {
		return {
			fileEntries: this.fileEntries,
			byId: this.byId,
			leafId: this.leafId,
		};
	}

	rewriteFile(): void {
		if (!this.persist || !this.sessionFile) return;
		const content = `${this.fileEntries.map((e) => JSON.stringify(e)).join("\n")}\n`;
		writeFileSync(this.sessionFile, content);
		this.headerOnDisk = true;
	}

	writeHeaderEagerly(): void {
		if (!this.persist || !this.sessionFile) return;
		if (this.headerOnDisk) return;
		const header = this.fileEntries[0];
		if (!header) return;
		appendFileSync(this.sessionFile, `${JSON.stringify(header)}\n`);
		this.headerOnDisk = true;
	}

	acquireLockForCurrentFile(): void {
		if (this.lockHandle) {
			this.lockHandle.release();
			this.lockHandle = undefined;
		}
		if (this.persist && this.sessionFile) {
			this.lockHandle = acquireSessionLock(this.sessionFile);
		}
	}

	releaseLock(): void {
		if (this.lockHandle) {
			this.lockHandle.release();
			this.lockHandle = undefined;
		}
	}

	close(): void {
		this.releaseLock();
	}

	/**
	 * Deferred flush: skip disk until first assistant message exists;
	 * then flush all pending lines once, then append one-by-one.
	 */
	persistEntry(entry: SessionEntry): void {
		if (!this.persist || !this.sessionFile) return;

		const hasAssistant = this.fileEntries.some((e) => e.type === "message" && e.message.role === "assistant");
		if (!hasAssistant) {
			this.flushed = false;
			return;
		}

		if (!this.flushed) {
			const startIdx = this.headerOnDisk && this.fileEntries[0]?.type === "session" ? 1 : 0;
			for (let i = startIdx; i < this.fileEntries.length; i++) {
				appendFileSync(this.sessionFile, `${JSON.stringify(this.fileEntries[i])}\n`);
			}
			this.flushed = true;
			this.headerOnDisk = true;
		} else {
			appendFileSync(this.sessionFile, `${JSON.stringify(entry)}\n`);
		}
	}

	/** Push entry as child of current leaf semantics are encoded in entry.parentId. */
	appendEntry(entry: SessionEntry): void {
		this.fileEntries.push(entry);
		this.byId.set(entry.id, entry);
		this.leafId = entry.id;
		this.persistEntry(entry);
	}

	/** Replace in-memory file with a new header+entries and reindex (fork/rollover). */
	replaceSessionContent(params: {
		sessionId: string;
		sessionFile: string | undefined;
		fileEntries: FileEntry[];
		flushed: boolean;
		headerOnDisk: boolean;
		acquireLock: boolean;
	}): void {
		this.sessionId = params.sessionId;
		this.sessionFile = params.sessionFile;
		this.fileEntries = params.fileEntries;
		this.flushed = params.flushed;
		this.headerOnDisk = params.headerOnDisk;
		this.rebuildIndex();
		if (params.acquireLock) {
			this.acquireLockForCurrentFile();
		}
	}
}
