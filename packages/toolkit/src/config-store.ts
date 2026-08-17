import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { atomicWriteJSON } from "./atomic-write.js";
import type { VersionedConfigMigrationResult } from "./versioned-config.js";

export interface VersionedJsonConfigStoreOptions<TConfig> {
	readonly path: string;
	readonly name: string;
	readonly normalize: (value: unknown) => TConfig;
	readonly migrate?: (value: unknown) => VersionedConfigMigrationResult;
	readonly writeJson?: (path: string, value: unknown) => Promise<void>;
	readonly logger?: VersionedJsonConfigStoreLogger;
}

export interface VersionedJsonConfigStore<TConfig> {
	readonly read: () => Promise<TConfig>;
	readonly readSync: () => TConfig;
	readonly write: (config: TConfig) => Promise<void>;
}

export interface VersionedJsonConfigStoreLogger {
	readonly warn: (...args: unknown[]) => void;
}

function parseConfig<TConfig>(
	raw: string,
	options: VersionedJsonConfigStoreOptions<TConfig>,
): { config: TConfig; migrated: boolean } {
	const value: unknown = JSON.parse(raw);
	const migration = options.migrate?.(value);
	return {
		config: options.normalize(migration ? migration.config : value),
		migrated: migration?.migrated ?? false,
	};
}

function isMissingFileError(error: unknown): boolean {
	return (
		typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ENOENT"
	);
}

function warnConfigFallback<TConfig>(options: VersionedJsonConfigStoreOptions<TConfig>, error: unknown): void {
	if (isMissingFileError(error)) return;
	options.logger?.warn("config read failed, using defaults", { name: options.name, path: options.path }, error);
}

function persistMigratedConfig<TConfig>(options: VersionedJsonConfigStoreOptions<TConfig>, config: TConfig): void {
	try {
		atomicWriteJSON(options.path, config);
	} catch (error) {
		options.logger?.warn("config migration write-back failed", { name: options.name, path: options.path }, error);
	}
}

async function persistMigratedConfigAsync<TConfig>(
	options: VersionedJsonConfigStoreOptions<TConfig>,
	config: TConfig,
): Promise<void> {
	if (!options.writeJson) {
		persistMigratedConfig(options, config);
		return;
	}
	try {
		await options.writeJson(options.path, config);
	} catch (error) {
		options.logger?.warn("config migration write-back failed", { name: options.name, path: options.path }, error);
	}
}

/**
 * Node-only versioned JSON config file store.
 * Domain schemas / migrations stay in the consuming package.
 */
export function createVersionedJsonConfigStore<TConfig>(
	options: VersionedJsonConfigStoreOptions<TConfig>,
): VersionedJsonConfigStore<TConfig> {
	return {
		async read() {
			try {
				const raw = await readFile(options.path, "utf8");
				const result = parseConfig(raw, options);
				if (result.migrated) await persistMigratedConfigAsync(options, result.config);
				return result.config;
			} catch (error) {
				warnConfigFallback(options, error);
				return options.normalize(undefined);
			}
		},

		readSync() {
			try {
				const raw = readFileSync(options.path, "utf8");
				const result = parseConfig(raw, options);
				if (result.migrated) persistMigratedConfig(options, result.config);
				return result.config;
			} catch (error) {
				warnConfigFallback(options, error);
				return options.normalize(undefined);
			}
		},

		async write(config) {
			try {
				const normalized = options.normalize(config);
				if (options.writeJson) {
					await options.writeJson(options.path, normalized);
				} else {
					atomicWriteJSON(options.path, normalized);
				}
			} catch (error) {
				options.logger?.warn("config write failed", { name: options.name, path: options.path }, error);
				throw error;
			}
		},
	};
}
