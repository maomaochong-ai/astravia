import { CONTEXT_RING_CIRCUMFERENCE } from "@astravia/theme-ui/chat";
import { contextUsageAtom, isCompactingAtom } from "@shared/store/atoms";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";

function formatTokens(count: number): string {
	if (count < 1000) return count.toString();
	if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1000000) return `${Math.round(count / 1000)}k`;
	return `${(count / 1000000).toFixed(1)}M`;
}

export interface ContextRingModel {
	percent: number;
	offset: number;
	color: string;
	isCompacting: boolean;
	tooltip: string;
}

export function useContextRingModel(): ContextRingModel | null {
	const { t } = useTranslation("chat");
	const ctx = useAtomValue(contextUsageAtom);
	const isCompacting = useAtomValue(isCompactingAtom);

	if (!ctx || !ctx.contextWindow) return null;

	const percent = ctx.percent ?? 0;
	const clamped = Math.min(100, Math.max(0, percent));
	const offset = CONTEXT_RING_CIRCUMFERENCE - (clamped / 100) * CONTEXT_RING_CIRCUMFERENCE;

	const color = percent > 90 ? "#ef4444" : percent > 70 ? "#f59e0b" : "var(--primary)";

	const tooltip = isCompacting
		? t("contextRing.tooltip.compacting")
		: ctx.percent !== null
			? t("contextRing.tooltip.usage", { percent: percent.toFixed(1), window: formatTokens(ctx.contextWindow) })
			: t("contextRing.tooltip.unknown", { window: formatTokens(ctx.contextWindow) });

	return {
		percent,
		offset,
		color,
		isCompacting,
		tooltip,
	};
}
