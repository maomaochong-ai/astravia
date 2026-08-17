import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, renameSync, writeSync } from "node:fs";
import { mkdir, open, rename } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * Atomically write a string to disk.
 *
 * Uses the standard write-temp → fsync → rename pattern. A crash, power loss,
 * or process kill at any point cannot leave a partial / corrupt target file:
 * either the rename has happened (new content) or it hasn't (old content).
 * The temporary file may be left behind on crash and is cleaned up by future
 * writes (the pid suffix avoids collisions across concurrent writers).
 *
 * The parent directory is created if it does not exist.
 */
export function atomicWriteFile(path: string, data: string): void {
	const dir = dirname(path);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

	const tmpPath = `${path}.${process.pid}.tmp`;
	const fd = openSync(tmpPath, "w");
	try {
		writeSync(fd, data);
		fsyncSync(fd);
	} finally {
		closeSync(fd);
	}
	renameSync(tmpPath, path);
}

/**
 * Atomically write a value as pretty-printed JSON.
 *
 * Convenience wrapper around atomicWriteFile for the common case of writing
 * a config / state file. Uses 2-space indentation to match existing config files.
 */
export function atomicWriteJSON(path: string, value: unknown): void {
	atomicWriteFile(path, JSON.stringify(value, null, 2));
}

export async function atomicWriteFileAsync(path: string, data: string): Promise<void> {
	const dir = dirname(path);
	await mkdir(dir, { recursive: true });

	const tmpPath = `${path}.${process.pid}.tmp`;
	const file = await open(tmpPath, "w");
	try {
		await file.writeFile(data);
		await file.sync();
	} finally {
		await file.close();
	}
	await rename(tmpPath, path);
}

export async function atomicWriteJSONAsync(path: string, value: unknown): Promise<void> {
	await atomicWriteFileAsync(path, JSON.stringify(value, null, 2));
}
