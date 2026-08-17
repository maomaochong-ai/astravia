import { useThemeHost } from "../host";
import type { ThemeUsageModel } from "./types";

export function useThemeUsageStats(): ThemeUsageModel {
	const host = useThemeHost();
	const useHostThemeUsageStats = host.usage?.useThemeUsageStats;
	if (!useHostThemeUsageStats) {
		throw new Error("Theme host does not provide theme usage capability.");
	}
	return useHostThemeUsageStats();
}
