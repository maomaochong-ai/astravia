import type { CultivationScoreBreakdown } from "../../cultivation";
import { sanctumPageAssets } from "./assets";

export type CultivationRuleMetricKey = keyof CultivationScoreBreakdown;

export interface CultivationRuleItem {
	readonly description: string;
	readonly iconUrl: string;
	readonly key: CultivationRuleMetricKey;
	readonly label: string;
}

export interface CultivationRuleCategory {
	readonly iconUrl: string;
	readonly id: string;
	readonly items: readonly CultivationRuleItem[];
	readonly label: string;
}

/**
 * User-facing scoring rules, aligned with weights in `cultivation/score.ts`.
 * Icons reuse the composition asset set prepared for the detailed rules view.
 */
export const CULTIVATION_RULE_CATEGORIES: readonly CultivationRuleCategory[] = [
	{
		id: "document",
		label: "文稿生成",
		iconUrl: sanctumPageAssets.cultivationCompositionIcons.document,
		items: [
			{
				key: "messages",
				label: "消息往来",
				description: "每条消息 +2",
				iconUrl: sanctumPageAssets.cultivationCompositionIcons.message,
			},
			{
				key: "turns",
				label: "对话轮次",
				description: "每轮对话 +4",
				iconUrl: sanctumPageAssets.cultivationCompositionIcons.chatSync,
			},
			{
				key: "depth",
				label: "深度对话",
				description: "最长会话轮次 ×0.8 + 消息数 ×0.2",
				iconUrl: sanctumPageAssets.cultivationCompositionIcons.comment,
			},
		],
	},
	{
		id: "data",
		label: "数据洞察",
		iconUrl: sanctumPageAssets.cultivationCompositionIcons.data,
		items: [
			{
				key: "activeTime",
				label: "活跃时长",
				description: "前台使用每分钟 +1",
				iconUrl: sanctumPageAssets.cultivationCompositionIcons.time,
			},
			{
				key: "sessions",
				label: "发起会话",
				description: "每个交互会话 +8",
				iconUrl: sanctumPageAssets.cultivationCompositionIcons.chat,
			},
			{
				key: "tokens",
				label: "算力消耗",
				description: "每千 token +0.05",
				iconUrl: sanctumPageAssets.cultivationCompositionIcons.media,
			},
			{
				key: "projects",
				label: "项目创建",
				description: "每个项目 +10",
				iconUrl: sanctumPageAssets.cultivationCompositionIcons.folder,
			},
		],
	},
	{
		id: "risk",
		label: "风险审查",
		iconUrl: sanctumPageAssets.cultivationCompositionIcons.risk,
		items: [
			{
				key: "tools",
				label: "工具调用",
				description: "每次完成工具调用 +1.5",
				iconUrl: sanctumPageAssets.cultivationCompositionIcons.toolCheck,
			},
			{
				key: "knowledge",
				label: "知识库",
				description: "每个知识库 +15，文件操作 +3",
				iconUrl: sanctumPageAssets.cultivationCompositionIcons.knowledge,
			},
		],
	},
	{
		id: "automation",
		label: "自动化任务",
		iconUrl: sanctumPageAssets.cultivationCompositionIcons.automation,
		items: [
			{
				key: "batch",
				label: "批量任务",
				description: "每次运行 +12",
				iconUrl: sanctumPageAssets.cultivationCompositionIcons.run,
			},
			{
				key: "automation",
				label: "自动化",
				description: "每次运行 +12",
				iconUrl: sanctumPageAssets.cultivationCompositionIcons.settings,
			},
			{
				key: "streak",
				label: "连续修炼",
				description: "连续活跃日 +25 / 天",
				iconUrl: sanctumPageAssets.cultivationCompositionIcons.calendar,
			},
		],
	},
] as const;

export function getRuleMetricValue(
	breakdown: CultivationScoreBreakdown,
	key: CultivationRuleMetricKey,
): number {
	return breakdown[key];
}
