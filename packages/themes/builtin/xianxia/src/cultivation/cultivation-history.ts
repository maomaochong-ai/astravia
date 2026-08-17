import type {
	CultivationDailyMetrics,
	CultivationDailyScore,
	CultivationHistory,
	CultivationSnapshot,
} from "./types";

/** Closed-day retention; the current day is added from the live snapshot. */
export const CULTIVATION_HISTORY_RETENTION_DAYS = 93;

export function createEmptyCultivationHistory(): CultivationHistory {
	return { dailyScores: [], dailyMetrics: [] };
}

export function getLocalDateKey(timestamp: number): string {
	const date = new Date(timestamp);
	const year = date.getFullYear();
	const month = `${date.getMonth() + 1}`.padStart(2, "0");
	const day = `${date.getDate()}`.padStart(2, "0");
	return `${year}-${month}-${day}`;
}

function snapshotMetricsForDay(snapshot: CultivationSnapshot): CultivationDailyMetrics {
	return {
		date: getLocalDateKey(snapshot.updatedAt),
		automationRuns: Math.max(0, snapshot.metrics.automationRuns),
		batchRuns: Math.max(0, snapshot.metrics.batchRuns),
		interactiveSessions: Math.max(0, snapshot.metrics.interactiveSessions),
		knowledgeBaseCount: Math.max(0, snapshot.metrics.knowledgeBaseCount),
		knowledgeBaseFileOperations: Math.max(0, snapshot.metrics.knowledgeBaseFileOperations),
		messages: Math.max(0, snapshot.metrics.messages),
		projectsCreated: Math.max(0, snapshot.metrics.projectsCreated),
		toolsCompleted: Math.max(0, snapshot.metrics.toolsCompleted),
	};
}

function mergeDailyScores(
	...sources: readonly (readonly CultivationDailyScore[])[]
): readonly CultivationDailyScore[] {
	const byDate = new Map<string, number>();
	for (const source of sources) {
		for (const entry of source) byDate.set(entry.date, entry.score);
	}
	return [...byDate.entries()]
		.sort(([left], [right]) => left.localeCompare(right))
		.slice(-(CULTIVATION_HISTORY_RETENTION_DAYS + 1))
		.map(([date, score]) => ({ date, score }));
}

function mergeDailyMetrics(
	...sources: readonly (readonly CultivationDailyMetrics[])[]
): readonly CultivationDailyMetrics[] {
	const byDate = new Map<string, CultivationDailyMetrics>();
	for (const source of sources) {
		for (const entry of source) byDate.set(entry.date, entry);
	}
	return [...byDate.entries()]
		.sort(([left], [right]) => left.localeCompare(right))
		.slice(-(CULTIVATION_HISTORY_RETENTION_DAYS + 1))
		.map(([, entry]) => entry);
}

/** Finalize the previous live snapshot when the calendar day advances. */
export function finalizeCultivationHistory(
	history: CultivationHistory,
	previousSnapshot: CultivationSnapshot | null | undefined,
	now: number,
): CultivationHistory {
	if (!previousSnapshot) return history;
	const today = getLocalDateKey(now);
	const previousDate = getLocalDateKey(previousSnapshot.updatedAt);
	if (previousDate >= today) return history;
	return {
		dailyScores: mergeDailyScores(history.dailyScores, [
			{ date: previousDate, score: previousSnapshot.score },
		]).slice(-CULTIVATION_HISTORY_RETENTION_DAYS),
		dailyMetrics: mergeDailyMetrics(history.dailyMetrics, [
			snapshotMetricsForDay(previousSnapshot),
		]).slice(-CULTIVATION_HISTORY_RETENTION_DAYS),
	};
}

export function getCultivationDailyScores(
	history: CultivationHistory,
	snapshot: Pick<CultivationSnapshot, "score" | "updatedAt">,
): readonly CultivationDailyScore[] {
	return mergeDailyScores(history.dailyScores, [
		{ date: getLocalDateKey(snapshot.updatedAt), score: snapshot.score },
	]);
}

export function getCultivationDailyMetrics(
	history: CultivationHistory,
	snapshot: CultivationSnapshot,
): readonly CultivationDailyMetrics[] {
	return mergeDailyMetrics(history.dailyMetrics, [snapshotMetricsForDay(snapshot)]);
}

export function isSameCultivationHistory(left: CultivationHistory, right: CultivationHistory): boolean {
	return (
		left.dailyScores.length === right.dailyScores.length &&
		left.dailyScores.every(
			(entry, index) =>
				entry.date === right.dailyScores[index]?.date && entry.score === right.dailyScores[index]?.score,
		) &&
		left.dailyMetrics.length === right.dailyMetrics.length &&
		left.dailyMetrics.every((entry, index) => {
			const other = right.dailyMetrics[index];
			return (
				entry.date === other?.date &&
				entry.automationRuns === other.automationRuns &&
				entry.batchRuns === other.batchRuns &&
				entry.interactiveSessions === other.interactiveSessions &&
				entry.knowledgeBaseCount === other.knowledgeBaseCount &&
				entry.knowledgeBaseFileOperations === other.knowledgeBaseFileOperations &&
				entry.messages === other.messages &&
				entry.projectsCreated === other.projectsCreated &&
				entry.toolsCompleted === other.toolsCompleted
			);
		})
	);
}
