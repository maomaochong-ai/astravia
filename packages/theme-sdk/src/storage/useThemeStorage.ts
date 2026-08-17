import { useThemeHost } from "../host";
import type { ThemeStorage } from "./types";

export function useThemeStorage(): ThemeStorage {
	const host = useThemeHost();
	const useHostThemeStorage = host.storage?.useThemeStorage;
	if (!useHostThemeStorage) {
		throw new Error("Theme host does not provide theme storage capability.");
	}
	return useHostThemeStorage();
}
