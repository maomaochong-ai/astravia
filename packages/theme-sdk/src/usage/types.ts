/**
 * Privacy-safe usage snapshot exposed to themes for progression systems.
 * Sourced from app-monitor aggregates (via host) — not raw event logs or user content.
 * Theme progression rules are theme-owned; this type only carries usage metrics.
 */
export interface ThemeUsageStats {
	readonly activeDayStreak: number;
	readonly automationRuns: number;
	readonly batchRuns: number;
	readonly foregroundActiveMs: number;
	readonly interactiveSessions: number;
	readonly knowledgeBaseCount: number;
	readonly knowledgeBaseFileOperations: number;
	readonly longestConversationMessages: number;
	readonly longestConversationTurns: number;
	readonly messages: number;
	readonly projectsCreated: number;
	readonly todayActiveMs: number;
	readonly todayMessages: number;
	readonly toolsCompleted: number;
	readonly totalTokens: number;
	readonly turns: number;
}

export type ThemeUsageStatus = "loading" | "ready" | "error";

export interface ThemeUsageModel {
	readonly refresh: () => Promise<void>;
	readonly stats: ThemeUsageStats | null;
	readonly status: ThemeUsageStatus;
}

export interface ThemeUsageThemeHost {
	readonly useThemeUsageStats: () => ThemeUsageModel;
}
