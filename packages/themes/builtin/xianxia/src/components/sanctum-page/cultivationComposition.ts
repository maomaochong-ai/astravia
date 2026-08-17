import { sanctumPageAssets } from "./assets";
import type { SanctumCultivationView } from "./types";

export type CultivationPanelView = "composition" | "rules";

export interface CultivationCompositionItem {
	readonly iconUrl: string;
	readonly label: string;
	readonly percent: number;
	readonly value: number;
}

/** Map score breakdown into the four composition categories shown in the popover. */
export function getCultivationCompositionItems(
	cultivation: SanctumCultivationView,
): readonly CultivationCompositionItem[] {
	const breakdown = cultivation.scoreBreakdown;
	const items = [
		{
			iconUrl: sanctumPageAssets.cultivationCompositionIcons.document,
			label: "文稿生成",
			value: breakdown.messages + breakdown.turns + breakdown.depth,
		},
		{
			iconUrl: sanctumPageAssets.cultivationCompositionIcons.data,
			label: "数据洞察",
			value: breakdown.activeTime + breakdown.sessions + breakdown.tokens + breakdown.projects,
		},
		{
			iconUrl: sanctumPageAssets.cultivationCompositionIcons.risk,
			label: "风险审查",
			value: breakdown.tools + breakdown.knowledge,
		},
		{
			iconUrl: sanctumPageAssets.cultivationCompositionIcons.automation,
			label: "自动化任务",
			value: breakdown.batch + breakdown.automation + breakdown.streak,
		},
	];
	const total = items.reduce((sum, item) => sum + item.value, 0);

	return items.map((item) => ({
		...item,
		percent: total > 0 ? Math.round((item.value / total) * 100) : 0,
		value: Math.floor(item.value),
	}));
}
