/**
 * 会话目录与发现：按 cwd / 全局列出会话，供 /resume 与 desktop 侧栏使用。
 *
 * 业务含义：从磁盘扫描 .jsonl，汇总 name、预览、修改时间等 SessionInfo。
 */

import type { AgentMessage } from "@astravia/agent-core";
import type { Message, TextContent } from "@astravia/ai";
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readSync, statSync } from "fs";
import { readdir, readFile, stat } from "fs/promises";
import { join } from "path";
import { getAgentDir as getDefaultAgentDir, getSessionsDir } from "../../config.js";
import type {
	FileEntry,
	SessionEntryBase,
	SessionHeader,
	SessionInfo,
	SessionInfoEntry,
	SessionMessageEntry,
} from "./session-model.js";

/**
 * Compute the default session directory for a cwd.
 * Encodes cwd into a safe directory name under ~/.pi/agent/sessions/.
 */
export function getDefaultSessionDir(cwd: string): string {
	const safePath = `--${cwd.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`;
	const sessionDir = join(getDefaultAgentDir(), "sessions", safePath);
	if (!existsSync(sessionDir)) {
		mkdirSync(sessionDir, { recursive: true });
	}
	return sessionDir;
}

function isValidSessionFile(filePath: string): boolean {
	try {
		const fd = openSync(filePath, "r");
		const buffer = Buffer.alloc(512);
		const bytesRead = readSync(fd, buffer, 0, 512, 0);
		closeSync(fd);
		const firstLine = buffer.toString("utf8", 0, bytesRead).split("\n")[0];
		if (!firstLine) return false;
		const header = JSON.parse(firstLine);
		return header.type === "session" && typeof header.id === "string";
	} catch {
		return false;
	}
}

/** Exported for testing */
export function findMostRecentSession(sessionDir: string): string | null {
	try {
		const files = readdirSync(sessionDir)
			.filter((f) => f.endsWith(".jsonl"))
			.map((f) => join(sessionDir, f))
			.filter(isValidSessionFile)
			.map((path) => ({ path, mtime: statSync(path).mtime }))
			.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

		return files[0]?.path || null;
	} catch {
		return null;
	}
}

function isMessageWithContent(message: AgentMessage): message is Message {
	return typeof (message as Message).role === "string" && "content" in message;
}

function extractTextContent(message: Message): string {
	const content = message.content;
	if (typeof content === "string") {
		return content;
	}
	return content
		.filter((block): block is TextContent => block.type === "text")
		.map((block) => block.text)
		.join(" ");
}

function getLastActivityTime(entries: FileEntry[]): number | undefined {
	let lastActivityTime: number | undefined;

	for (const entry of entries) {
		if (entry.type !== "message") continue;

		const message = (entry as SessionMessageEntry).message;
		if (!isMessageWithContent(message)) continue;
		if (message.role !== "user" && message.role !== "assistant") continue;

		const msgTimestamp = (message as { timestamp?: number }).timestamp;
		if (typeof msgTimestamp === "number") {
			lastActivityTime = Math.max(lastActivityTime ?? 0, msgTimestamp);
			continue;
		}

		const entryTimestamp = (entry as SessionEntryBase).timestamp;
		if (typeof entryTimestamp === "string") {
			const t = new Date(entryTimestamp).getTime();
			if (!Number.isNaN(t)) {
				lastActivityTime = Math.max(lastActivityTime ?? 0, t);
			}
		}
	}

	return lastActivityTime;
}

function getSessionModifiedDate(entries: FileEntry[], header: SessionHeader, statsMtime: Date): Date {
	const lastActivityTime = getLastActivityTime(entries);
	if (typeof lastActivityTime === "number" && lastActivityTime > 0) {
		return new Date(lastActivityTime);
	}

	const headerTime = typeof header.timestamp === "string" ? new Date(header.timestamp).getTime() : NaN;
	return !Number.isNaN(headerTime) ? new Date(headerTime) : statsMtime;
}

export async function buildSessionInfo(filePath: string): Promise<SessionInfo | null> {
	try {
		const content = await readFile(filePath, "utf8");
		const entries: FileEntry[] = [];
		const lines = content.trim().split("\n");

		for (const line of lines) {
			if (!line.trim()) continue;
			try {
				entries.push(JSON.parse(line) as FileEntry);
			} catch {
				// Skip malformed lines
			}
		}

		if (entries.length === 0) return null;
		const header = entries[0];
		if (header.type !== "session") return null;

		const stats = await stat(filePath);
		let messageCount = 0;
		let firstMessage = "";
		const allMessages: string[] = [];
		let name: string | undefined;

		for (const entry of entries) {
			// Extract session name (use latest)
			if (entry.type === "session_info") {
				const infoEntry = entry as SessionInfoEntry;
				if (infoEntry.name) {
					name = infoEntry.name.trim();
				}
			}

			if (entry.type !== "message") continue;
			messageCount++;

			const message = (entry as SessionMessageEntry).message;
			if (!isMessageWithContent(message)) continue;
			if (message.role !== "user" && message.role !== "assistant") continue;

			const textContent = extractTextContent(message);
			if (!textContent) continue;

			allMessages.push(textContent);
			if (!firstMessage && message.role === "user") {
				firstMessage = textContent;
			}
		}

		const cwd = typeof (header as SessionHeader).cwd === "string" ? (header as SessionHeader).cwd : "";
		const parentSessionPath = (header as SessionHeader).parentSession;
		const parentEntryId =
			typeof (header as SessionHeader).parentEntryId === "string"
				? (header as SessionHeader).parentEntryId
				: undefined;

		const modified = getSessionModifiedDate(entries, header as SessionHeader, stats.mtime);

		// 复用已解析的消息数组，取最后一条用户/助手消息正文做预览（约 120 字符）。
		const lastMessage = allMessages.length > 0 ? allMessages[allMessages.length - 1] : "";
		const lastMessagePreview = lastMessage.trim().slice(0, 120);

		return {
			path: filePath,
			id: (header as SessionHeader).id,
			cwd,
			name,
			parentSessionPath,
			parentEntryId,
			created: new Date((header as SessionHeader).timestamp),
			modified,
			messageCount,
			firstMessage: firstMessage || "(no messages)",
			allMessagesText: allMessages.join(" "),
			lastMessagePreview,
		};
	} catch {
		return null;
	}
}

export type SessionListProgress = (loaded: number, total: number) => void;

async function listSessionsFromDir(
	dir: string,
	onProgress?: SessionListProgress,
	progressOffset = 0,
	progressTotal?: number,
): Promise<SessionInfo[]> {
	const sessions: SessionInfo[] = [];
	if (!existsSync(dir)) {
		return sessions;
	}

	try {
		const dirEntries = await readdir(dir);
		const files = dirEntries.filter((f) => f.endsWith(".jsonl")).map((f) => join(dir, f));
		const total = progressTotal ?? files.length;

		let loaded = 0;
		const results = await Promise.all(
			files.map(async (file) => {
				const info = await buildSessionInfo(file);
				loaded++;
				onProgress?.(progressOffset + loaded, total);
				return info;
			}),
		);
		for (const info of results) {
			if (info) {
				sessions.push(info);
			}
		}
	} catch {
		// Return empty list on error
	}

	return sessions;
}

/** List all sessions for a directory (newest modified first). */
export async function listSessions(
	cwd: string,
	sessionDir?: string,
	onProgress?: SessionListProgress,
): Promise<SessionInfo[]> {
	const dir = sessionDir ?? getDefaultSessionDir(cwd);
	const sessions = await listSessionsFromDir(dir, onProgress);
	sessions.sort((a, b) => b.modified.getTime() - a.modified.getTime());
	return sessions;
}

/** List all sessions across all project directories (newest modified first). */
export async function listAllSessions(onProgress?: SessionListProgress): Promise<SessionInfo[]> {
	const sessionsDir = getSessionsDir();

	try {
		if (!existsSync(sessionsDir)) {
			return [];
		}
		const entries = await readdir(sessionsDir, { withFileTypes: true });
		const dirs = entries.filter((e) => e.isDirectory()).map((e) => join(sessionsDir, e.name));

		// Count total files first for accurate progress
		let totalFiles = 0;
		const dirFiles: string[][] = [];
		for (const dir of dirs) {
			try {
				const files = (await readdir(dir)).filter((f) => f.endsWith(".jsonl"));
				dirFiles.push(files.map((f) => join(dir, f)));
				totalFiles += files.length;
			} catch {
				dirFiles.push([]);
			}
		}

		// Process all files with progress tracking
		let loaded = 0;
		const sessions: SessionInfo[] = [];
		const allFiles = dirFiles.flat();

		const results = await Promise.all(
			allFiles.map(async (file) => {
				const info = await buildSessionInfo(file);
				loaded++;
				onProgress?.(loaded, totalFiles);
				return info;
			}),
		);

		for (const info of results) {
			if (info) {
				sessions.push(info);
			}
		}

		sessions.sort((a, b) => b.modified.getTime() - a.modified.getTime());
		return sessions;
	} catch {
		return [];
	}
}
