/**
 * 会话生命周期：新建 / 打开 / 继续最近 / 切换文件 / 工厂入口。
 *
 * 对应 CLI resume、SDK create/open、/new。
 */

import { randomUUID } from "crypto";
import { existsSync } from "fs";
import { join, resolve } from "path";
import { loadEntriesFromFile, migrateToCurrentVersion } from "./format-compat.js";
import { findMostRecentSession, getDefaultSessionDir } from "./session-catalog.js";
import { CURRENT_SESSION_VERSION, type NewSessionOptions, type SessionHeader } from "./session-model.js";
import type { SessionStore } from "./session-store.js";

/** Reset store to a brand-new session header (does not lock or write header). */
export function resetToNewSession(store: SessionStore, options?: NewSessionOptions): void {
	store.sessionId = randomUUID();
	const timestamp = new Date().toISOString();
	const header: SessionHeader = {
		type: "session",
		version: CURRENT_SESSION_VERSION,
		id: store.sessionId,
		timestamp,
		cwd: store.cwd,
		parentSession: options?.parentSession,
	};
	store.fileEntries = [header];
	store.byId.clear();
	store.labelsById.clear();
	store.leafId = null;
	store.flushed = false;
	store.headerOnDisk = false;

	if (store.persist) {
		const fileTimestamp = timestamp.replace(/[:.]/g, "-");
		store.sessionFile = join(store.getSessionDir(), `${fileTimestamp}_${store.sessionId}.jsonl`);
	}
}

/** Start a new session: reset, lock, eager header. Returns session file path. */
export function newSession(store: SessionStore, options?: NewSessionOptions): string | undefined {
	resetToNewSession(store, options);
	store.acquireLockForCurrentFile();
	store.writeHeaderEagerly();
	return store.sessionFile;
}

/**
 * Switch store to a session file (resume / switchSession).
 * Empty or missing files become a fresh session at that path.
 */
export function setSessionFile(store: SessionStore, sessionFile: string): void {
	store.sessionFile = resolve(sessionFile);
	if (existsSync(store.sessionFile)) {
		store.fileEntries = loadEntriesFromFile(store.sessionFile);

		if (store.fileEntries.length === 0) {
			const explicitPath = store.sessionFile;
			resetToNewSession(store);
			store.sessionFile = explicitPath;
			store.rewriteFile();
			store.flushed = true;
			store.acquireLockForCurrentFile();
			return;
		}

		const header = store.fileEntries.find((e) => e.type === "session") as SessionHeader | undefined;
		store.sessionId = header?.id ?? randomUUID();

		if (migrateToCurrentVersion(store.fileEntries)) {
			store.rewriteFile();
		}

		store.rebuildIndex();
		store.flushed = true;
		store.headerOnDisk = true;
		store.acquireLockForCurrentFile();
	} else {
		const explicitPath = store.sessionFile;
		resetToNewSession(store);
		store.sessionFile = explicitPath;
		store.acquireLockForCurrentFile();
		store.writeHeaderEagerly();
	}
}

/** Bind store to initial path or new session (constructor helper). */
export function initializeStore(
	store: SessionStore,
	sessionFile: string | undefined,
	options?: NewSessionOptions,
): void {
	if (sessionFile) {
		setSessionFile(store, sessionFile);
	} else {
		newSession(store, options);
	}
}

export type SessionOpenArgs = {
	cwd: string;
	sessionDir: string;
	sessionFile: string | undefined;
	persist: boolean;
	options?: NewSessionOptions;
};

export function resolveCreateArgs(cwd: string, sessionDir?: string, options?: NewSessionOptions): SessionOpenArgs {
	return {
		cwd,
		sessionDir: sessionDir ?? getDefaultSessionDir(cwd),
		sessionFile: undefined,
		persist: true,
		options,
	};
}

export function resolveOpenArgs(path: string, sessionDir?: string, options?: NewSessionOptions): SessionOpenArgs {
	const entries = loadEntriesFromFile(path);
	const header = entries.find((e) => e.type === "session") as SessionHeader | undefined;
	const cwd = header?.cwd ?? process.cwd();
	const dir = sessionDir ?? resolve(path, "..");
	return {
		cwd,
		sessionDir: dir,
		sessionFile: path,
		persist: true,
		options,
	};
}

export function resolveContinueRecentArgs(cwd: string, sessionDir?: string): SessionOpenArgs {
	const dir = sessionDir ?? getDefaultSessionDir(cwd);
	const mostRecent = findMostRecentSession(dir);
	return {
		cwd,
		sessionDir: dir,
		sessionFile: mostRecent ?? undefined,
		persist: true,
	};
}

export function resolveInMemoryArgs(cwd: string = process.cwd()): SessionOpenArgs {
	return {
		cwd,
		sessionDir: "",
		sessionFile: undefined,
		persist: false,
	};
}
