import { useSyncExternalStore } from "react";
import {
	CULTIVATION_REALMS,
	getCultivationDailyMetrics,
	getCultivationDailyScores,
	type CultivationState,
	useCultivationRepository,
} from "../../cultivation";
import type { SanctumCultivationView } from "./types";

const fallbackRealm = CULTIVATION_REALMS[0];

const emptyMetrics = {
	activeDayStreak: 0,
	automationRuns: 0,
	batchRuns: 0,
	foregroundActiveMs: 0,
	interactiveSessions: 0,
	knowledgeBaseCount: 0,
	knowledgeBaseFileOperations: 0,
	longestConversationMessages: 0,
	longestConversationTurns: 0,
	messages: 0,
	projectsCreated: 0,
	todayActiveMs: 0,
	todayMessages: 0,
	toolsCompleted: 0,
	totalTokens: 0,
	turns: 0,
} as const;

const fallbackCultivationView: SanctumCultivationView = {
	achievedRealmIds: [fallbackRealm.id],
	currentPower: 0,
	dailyMetrics: [],
	englishName: fallbackRealm.englishName,
	growth: [
		{ label: "今日", value: 0 },
		{ label: "本周", value: 0 },
		{ label: "近30天", value: 0 },
	],
	level: fallbackRealm.level,
	maxPower: CULTIVATION_REALMS[1]?.targetScore ?? 0,
	metrics: emptyMetrics,
	name: fallbackRealm.name,
	nextRealmId: CULTIVATION_REALMS[1]?.id ?? null,
	progressPercent: "0%",
	progressToNext: 0,
	realmId: fallbackRealm.id,
	score: 0,
	scoreBreakdown: {
		activeTime: 0,
		automation: 0,
		batch: 0,
		depth: 0,
		knowledge: 0,
		messages: 0,
		projects: 0,
		sessions: 0,
		streak: 0,
		tokens: 0,
		tools: 0,
		turns: 0,
	},
	trend: [
		{
			date: getLocalDateKey(Date.now()),
			label: "今日",
			power: 0,
			score: 0,
		},
	],
};

function getLocalDateKey(timestamp: number): string {
	const date = new Date(timestamp);
	const year = date.getFullYear();
	const month = `${date.getMonth() + 1}`.padStart(2, "0");
	const day = `${date.getDate()}`.padStart(2, "0");
	return `${year}-${month}-${day}`;
}

function formatTrendLabel(dateKey: string): string {
	const [, month, day] = dateKey.split("-");
	return `${Number(month)}/${Number(day)}`;
}

function toTrendPoints(state: CultivationState): SanctumCultivationView["trend"] {
	return getCultivationDailyScores(state.history, state.snapshot)
		// Align with cultivation daily retention (~3 months) for period navigation.
		.slice(-93)
		.map((entry) => ({
			date: entry.date,
			label: formatTrendLabel(entry.date),
			power: Math.max(0, Math.floor(entry.score)),
			score: entry.score,
		}));
}

function useCultivationState(): CultivationState | null {
	const repository = useCultivationRepository();

	useSyncExternalStore(
		repository.subscribe,
		repository.getSnapshot,
		() => "loading:",
	);

	if (repository.status !== "ready") return null;
	return repository.load();
}

function toCultivationView(state: CultivationState | null): SanctumCultivationView {
	if (!state) return fallbackCultivationView;
	const { snapshot } = state;
	const maxPower =
		snapshot.cultivationPowerTarget > 0
			? snapshot.cultivationPowerTarget
			: Math.max(snapshot.cultivationPower, 1);

	return {
		achievedRealmIds: snapshot.achievedRealmIds,
		currentPower: snapshot.cultivationPower,
		dailyMetrics: getCultivationDailyMetrics(state.history, snapshot),
		englishName: snapshot.englishName,
		growth: [
			{ label: "今日", value: snapshot.growth.today },
			{ label: "本周", value: snapshot.growth.thisWeek },
			{ label: "近30天", value: snapshot.growth.last30Days },
		],
		level: snapshot.level,
		maxPower,
		metrics: snapshot.metrics ?? emptyMetrics,
		name: snapshot.name,
		nextRealmId: snapshot.nextRealmId,
		progressPercent: `${Math.round(snapshot.progressToNext * 100)}%`,
		progressToNext: snapshot.progressToNext,
		realmId: snapshot.realmId,
		score: snapshot.score,
		scoreBreakdown: snapshot.scoreBreakdown,
		trend: toTrendPoints(state),
	};
}

export function useSanctumCultivationView(): SanctumCultivationView {
	return toCultivationView(useCultivationState());
}

export function formatCultivationNumber(value: number): string {
	return Math.floor(value).toLocaleString("en-US");
}

export function getCultivationChartUpperBound(value: number): number {
	const maximum = Math.max(0, value);
	if (maximum === 0) return 1;
	const step = 10 ** Math.floor(Math.log10(maximum)) / 2;
	return Math.ceil((maximum * 1.15) / step) * step;
}

export function formatRealmTitle(name: string): string {
	return name.split("").join(" ");
}
