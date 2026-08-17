/**
 * 会话分叉与归档：export 分支、CLI /fork、跨项目 forkFrom、memory-mode rollover。
 *
 * 产出新 .jsonl 或切换 store 指向新文件；旧文件可保留为 parentSession 归档。
 */

import { randomUUID } from "crypto";
import { appendFileSync, existsSync, mkdirSync } from "fs";
import {
	buildExportBranchContent,
	buildRolloverChain,
	createForkHeader,
	newSessionFilePath,
	nonHeaderEntries,
} from "./branch-ops.js";
import { loadEntriesFromFile } from "./format-compat.js";
import { getDefaultSessionDir } from "./session-catalog.js";
import { CURRENT_SESSION_VERSION, type SessionHeader } from "./session-model.js";
import type { SessionStore } from "./session-store.js";
import { getBranch } from "./tree-navigation.js";

function writeBranchFile(
	newSessionFile: string,
	header: SessionHeader,
	path: ReturnType<typeof buildExportBranchContent>["pathWithoutLabels"],
	labelEntries: ReturnType<typeof buildExportBranchContent>["labelEntries"],
): void {
	appendFileSync(newSessionFile, `${JSON.stringify(header)}\n`);
	for (const entry of path) {
		appendFileSync(newSessionFile, `${JSON.stringify(entry)}\n`);
	}
	for (const entry of labelEntries) {
		appendFileSync(newSessionFile, `${JSON.stringify(entry)}\n`);
	}
}

/**
 * Write root→leaf to a new file without switching the current store (desktop-safe).
 */
export function exportBranchToNewFile(
	store: SessionStore,
	leafId: string | null,
	options?: { parentEntryId?: string },
): string | undefined {
	if (!store.persist) return undefined;
	if (!existsSync(store.getSessionDir())) {
		mkdirSync(store.getSessionDir(), { recursive: true });
	}
	const pathWithoutLabels = leafId === null ? [] : getBranch(store, leafId).filter((e) => e.type !== "label");
	const content = buildExportBranchContent({
		leafId,
		pathWithoutLabels,
		labelsById: store.labelsById,
		cwd: store.cwd,
		sessionDir: store.getSessionDir(),
		previousSessionFile: store.sessionFile,
		persist: store.persist,
		parentEntryId: options?.parentEntryId,
	});
	writeBranchFile(content.newSessionFile, content.header, content.pathWithoutLabels, content.labelEntries);
	return content.newSessionFile;
}

/**
 * Export root→leaf and switch this store to the new file (CLI /fork).
 */
export function createBranchedSession(store: SessionStore, leafId: string): string | undefined {
	const pathWithoutLabels = getBranch(store, leafId).filter((e) => e.type !== "label");
	const content = buildExportBranchContent({
		leafId,
		pathWithoutLabels,
		labelsById: store.labelsById,
		cwd: store.cwd,
		sessionDir: store.getSessionDir(),
		previousSessionFile: store.sessionFile,
		persist: store.persist,
	});

	if (store.persist) {
		if (!existsSync(store.getSessionDir())) {
			mkdirSync(store.getSessionDir(), { recursive: true });
		}
		store.releaseLock();
		writeBranchFile(content.newSessionFile, content.header, content.pathWithoutLabels, content.labelEntries);
		store.replaceSessionContent({
			sessionId: content.header.id,
			sessionFile: content.newSessionFile,
			fileEntries: [content.header, ...content.pathWithoutLabels, ...content.labelEntries],
			flushed: true,
			headerOnDisk: true,
			acquireLock: true,
		});
		return content.newSessionFile;
	}

	store.replaceSessionContent({
		sessionId: content.header.id,
		sessionFile: store.sessionFile,
		fileEntries: [content.header, ...content.pathWithoutLabels, ...content.labelEntries],
		flushed: store.flushed,
		headerOnDisk: store.headerOnDisk,
		acquireLock: false,
	});
	return undefined;
}

/**
 * ADR-0009: after compaction, roll to a new small file (summary + kept tail).
 * Old file stays as archive via parentSession.
 */
export function rolloverToNewFile(store: SessionStore): { from: string | undefined; to: string | undefined } {
	const from = store.sessionFile;
	if (!store.persist) return { from, to: from };

	const path = getBranch(store);
	const chain = buildRolloverChain(path);
	if (!chain) return { from, to: from };

	const newSessionId = randomUUID();
	const timestamp = new Date().toISOString();
	const header: SessionHeader = {
		type: "session",
		version: CURRENT_SESSION_VERSION,
		id: newSessionId,
		timestamp,
		cwd: store.cwd,
		parentSession: from,
	};

	store.releaseLock();
	const newSessionFile = newSessionFilePath(store.getSessionDir(), newSessionId, timestamp);
	store.sessionId = newSessionId;
	store.fileEntries = [header, ...chain.newEntries];
	store.sessionFile = newSessionFile;
	store.rebuildIndex();
	store.rewriteFile();
	store.flushed = true;
	store.headerOnDisk = true;
	store.acquireLockForCurrentFile();

	return { from, to: store.sessionFile };
}

/**
 * Copy full history from source session into a new file under targetCwd.
 * Returns paths needed to open the forked session.
 */
export function writeForkedSessionFile(
	sourcePath: string,
	targetCwd: string,
	sessionDir?: string,
): { targetCwd: string; dir: string; newSessionFile: string } {
	const sourceEntries = loadEntriesFromFile(sourcePath);
	if (sourceEntries.length === 0) {
		throw new Error(`Cannot fork: source session file is empty or invalid: ${sourcePath}`);
	}

	const sourceHeader = sourceEntries.find((e) => e.type === "session") as SessionHeader | undefined;
	if (!sourceHeader) {
		throw new Error(`Cannot fork: source session has no header: ${sourcePath}`);
	}

	const dir = sessionDir ?? getDefaultSessionDir(targetCwd);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}

	const newSessionId = randomUUID();
	const timestamp = new Date().toISOString();
	const newSessionFile = newSessionFilePath(dir, newSessionId, timestamp);

	const newHeader = createForkHeader({
		targetCwd,
		sourcePath,
		sessionId: newSessionId,
		timestamp,
	});
	appendFileSync(newSessionFile, `${JSON.stringify(newHeader)}\n`);
	for (const entry of nonHeaderEntries(sourceEntries)) {
		appendFileSync(newSessionFile, `${JSON.stringify(entry)}\n`);
	}

	return { targetCwd, dir, newSessionFile };
}
