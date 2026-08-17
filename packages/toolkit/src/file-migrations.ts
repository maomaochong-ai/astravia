import { existsSync } from "node:fs";
import { readdir, readFile, rm, stat } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { atomicWriteFileAsync, atomicWriteJSONAsync } from "./atomic-write.js";

export interface FileMigration {
	readonly version: number;
	readonly id: string;
	readonly migrate: (context: FileMigrationContext) => Promise<void>;
}

export interface FileMigrationContext {
	readonly root: string;
	resolvePath(path: string): string;
	exists(path: string): Promise<boolean>;
	readText(path: string): Promise<string | null>;
	writeText(path: string, value: string): Promise<void>;
	readJson(path: string): Promise<unknown | null>;
	writeJson(path: string, value: unknown): Promise<void>;
	remove(path: string): Promise<void>;
	list(path?: string): Promise<readonly FileMigrationEntry[]>;
}

export interface FileMigrationEntry {
	readonly name: string;
	readonly path: string;
	readonly type: "file" | "directory";
	readonly size: number;
	readonly modifiedAt: number;
}

export interface RunFileMigrationsOptions {
	readonly root: string;
	readonly migrations: readonly FileMigration[];
	readonly statePath?: string;
	readonly logger?: FileMigrationLogger;
}

export interface FileMigrationLogger {
	readonly info?: (...args: unknown[]) => void;
	readonly warn?: (...args: unknown[]) => void;
}

export interface RunFileMigrationsResult {
	readonly applied: readonly FileMigrationApplied[];
	readonly currentVersion: number;
	readonly skipped: readonly FileMigrationApplied[];
}

export interface FileMigrationApplied {
	readonly version: number;
	readonly id: string;
	readonly appliedAt: string;
}

interface FileMigrationState {
	readonly schemaVersion: 1;
	readonly currentVersion: number;
	readonly applied: readonly FileMigrationApplied[];
}

const DEFAULT_STATE_PATH = ".migrations.json";

function normalizeRelativePath(path: string): string {
	const trimmed = path.trim();
	if (trimmed === "") return "";
	if (trimmed.includes("\\") || trimmed.includes("\0")) {
		throw new Error("Migration path must use forward-slash relative paths");
	}
	if (trimmed.startsWith("/") || /^[a-zA-Z]:/.test(trimmed)) {
		throw new Error("Migration path must be relative");
	}
	const segments = trimmed.split("/");
	for (const segment of segments) {
		if (segment === "" || segment === "." || segment === "..") {
			throw new Error(`Invalid migration path segment: ${segment}`);
		}
	}
	return segments.join("/");
}

function resolveInRoot(root: string, path: string): string {
	const normalizedPath = normalizeRelativePath(path);
	const resolvedRoot = resolve(root);
	const target = resolve(resolvedRoot, normalizedPath);
	const relativePath = relative(resolvedRoot, target);
	if (relativePath.startsWith("..") || relativePath === ".." || relativePath.includes(`..${sep}`)) {
		throw new Error("Migration path escapes root");
	}
	return target;
}

function isState(value: unknown): value is FileMigrationState {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
	const record = value as Record<string, unknown>;
	return (
		record.schemaVersion === 1 &&
		typeof record.currentVersion === "number" &&
		Number.isInteger(record.currentVersion) &&
		record.currentVersion >= 0 &&
		Array.isArray(record.applied) &&
		record.applied.every((entry) => {
			if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return false;
			const applied = entry as Record<string, unknown>;
			return (
				typeof applied.version === "number" &&
				Number.isInteger(applied.version) &&
				applied.version > 0 &&
				typeof applied.id === "string" &&
				typeof applied.appliedAt === "string"
			);
		})
	);
}

async function readState(context: FileMigrationContext, statePath: string): Promise<FileMigrationState> {
	const value = await context.readJson(statePath);
	if (value === null) return { applied: [], currentVersion: 0, schemaVersion: 1 };
	if (!isState(value)) {
		throw new Error(`Invalid file migration state: ${statePath}`);
	}
	return value;
}

function assertValidMigrations(migrations: readonly FileMigration[]): readonly FileMigration[] {
	const seenIds = new Set<string>();
	const seenVersions = new Set<number>();
	let previousVersion = 0;
	for (const migration of migrations) {
		if (!Number.isInteger(migration.version) || migration.version <= 0) {
			throw new Error(`Invalid file migration version for ${migration.id}: ${migration.version}`);
		}
		if (migration.version <= previousVersion) {
			throw new Error("File migrations must be ordered by increasing version");
		}
		if (migration.id.trim() === "") {
			throw new Error("File migration id must not be empty");
		}
		if (seenVersions.has(migration.version)) {
			throw new Error(`Duplicate file migration version: ${migration.version}`);
		}
		if (seenIds.has(migration.id)) {
			throw new Error(`Duplicate file migration id: ${migration.id}`);
		}
		seenVersions.add(migration.version);
		seenIds.add(migration.id);
		previousVersion = migration.version;
	}
	return migrations;
}

function createContext(root: string): FileMigrationContext {
	const resolvedRoot = resolve(root);
	const resolvePath = (path: string): string => resolveInRoot(resolvedRoot, path);
	const readText = async (path: string): Promise<string | null> => {
		const target = resolvePath(path);
		if (!existsSync(target)) return null;
		const targetStats = await stat(target);
		if (!targetStats.isFile()) return null;
		return readFile(target, "utf8");
	};

	return {
		root: resolvedRoot,
		resolvePath,
		async exists(path) {
			return existsSync(resolvePath(path));
		},
		async list(path = "") {
			const basePath = resolvePath(path);
			if (!existsSync(basePath)) return [];
			const baseStats = await stat(basePath);
			if (!baseStats.isDirectory()) return [];

			const entries = await readdir(basePath, { withFileTypes: true });
			const result: FileMigrationEntry[] = [];
			for (const entry of entries) {
				if (!entry.isFile() && !entry.isDirectory()) continue;
				const child = join(basePath, entry.name);
				const childStats = await stat(child);
				result.push({
					modifiedAt: childStats.mtimeMs,
					name: entry.name,
					path: relative(resolvedRoot, child).split(sep).join("/"),
					size: childStats.size,
					type: childStats.isDirectory() ? "directory" : "file",
				});
			}
			return result.sort((left, right) => left.path.localeCompare(right.path));
		},
		async readJson(path) {
			const raw = await readText(path);
			return raw === null ? null : JSON.parse(raw);
		},
		readText,
		async remove(path) {
			await rm(resolvePath(path), { force: true, recursive: true });
		},
		async writeJson(path, value) {
			await atomicWriteJSONAsync(resolvePath(path), value);
		},
		async writeText(path, value) {
			const target = resolvePath(path);
			await atomicWriteFileAsync(target, value);
		},
	};
}

export async function runFileMigrations(options: RunFileMigrationsOptions): Promise<RunFileMigrationsResult> {
	const migrations = assertValidMigrations(options.migrations);

	const statePath = options.statePath ?? DEFAULT_STATE_PATH;
	normalizeRelativePath(statePath);

	const context = createContext(options.root);
	const state = await readState(context, statePath);
	const applied: FileMigrationApplied[] = [];
	const skipped: FileMigrationApplied[] = [];
	let currentVersion = state.currentVersion;

	for (const migration of migrations) {
		if (migration.version <= currentVersion) {
			const existing = state.applied.find(
				(entry) => entry.version === migration.version && entry.id === migration.id,
			);
			skipped.push(existing ?? { appliedAt: "", id: migration.id, version: migration.version });
			continue;
		}

		options.logger?.info?.("running file migration", {
			id: migration.id,
			root: context.root,
			version: migration.version,
		});
		await migration.migrate(context);
		const appliedEntry: FileMigrationApplied = {
			appliedAt: new Date().toISOString(),
			id: migration.id,
			version: migration.version,
		};
		applied.push(appliedEntry);
		currentVersion = migration.version;
		await context.writeJson(statePath, {
			applied: [...state.applied, ...applied],
			currentVersion,
			schemaVersion: 1,
		} satisfies FileMigrationState);
	}

	return { applied, currentVersion, skipped };
}
