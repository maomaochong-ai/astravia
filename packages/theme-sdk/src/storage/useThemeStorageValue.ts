import { useCallback, useSyncExternalStore } from "react";
import type { ThemeStorageStatus, ThemeStorageValue } from "./types";
import { useThemeStorage } from "./useThemeStorage";

function readStoredValue<T extends ThemeStorageValue>(
	get: (key: string) => ThemeStorageValue | undefined,
	key: string,
	defaultValue: T,
): T {
	const value = get(key);
	return value === undefined ? defaultValue : (value as T);
}

/**
 * React-friendly accessor for a single theme storage key.
 * Value is read from the host cache; updates are optimistic and persisted by the host.
 *
 * Prefer a stable `defaultValue` reference (module-level constant) for object defaults.
 */
export function useThemeStorageValue<T extends ThemeStorageValue>(
	key: string,
	defaultValue: T,
): readonly [T, (next: T | ((prev: T) => T)) => void, { readonly status: ThemeStorageStatus }] {
	const storage = useThemeStorage();

	// Include status in the snapshot so loading → ready transitions re-render.
	useSyncExternalStore(
		storage.subscribe,
		() => `${storage.status}:${JSON.stringify(storage.get(key))}`,
		() => `loading:`,
	);

	const value = readStoredValue(storage.get, key, defaultValue);

	const setValue = useCallback(
		(next: T | ((prev: T) => T)) => {
			const prev = readStoredValue(storage.get, key, defaultValue);
			const resolved = typeof next === "function" ? (next as (prev: T) => T)(prev) : next;
			storage.set(key, resolved);
		},
		[defaultValue, key, storage],
	);

	return [value, setValue, { status: storage.status }] as const;
}
