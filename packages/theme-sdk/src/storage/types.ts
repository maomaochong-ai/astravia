/**
 * JSON-serializable values allowed in theme-owned storage.
 * Functions, undefined, symbols, and cyclic structures are not supported.
 */
export type ThemeStorageValue =
	| null
	| boolean
	| number
	| string
	| ThemeStorageValue[]
	| { readonly [key: string]: ThemeStorageValue };

export type ThemeStorageStatus = "loading" | "ready" | "error";

/**
 * Per-theme key-value storage bound to the active theme id by the host.
 * Themes must not pass an arbitrary themeId — isolation is enforced by the host.
 *
 * Reads are synchronous against an in-memory cache.
 * Writes update the cache immediately and persist asynchronously via the host.
 */
export interface ThemeStorage {
	readonly themeId: string;
	readonly status: ThemeStorageStatus;
	/** Sync read from cache. Returns undefined when missing or not ready. */
	get(key: string): ThemeStorageValue | undefined;
	/** Optimistic cache write + async persist. */
	set(key: string, value: ThemeStorageValue): void;
	remove(key: string): void;
	/** Clears only this theme's data. */
	clear(): void;
	subscribe(listener: () => void): () => void;
}

export interface ThemeStorageThemeHost {
	readonly useThemeStorage: () => ThemeStorage;
}
