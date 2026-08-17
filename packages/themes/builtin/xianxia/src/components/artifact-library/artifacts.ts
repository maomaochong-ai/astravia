import { artifactLibraryAssets } from "./assets";

export interface ArtifactItem {
	readonly category: string;
	readonly description: string;
	readonly id: string;
	readonly imageUrl: string;
	readonly level: number;
	readonly name: string;
	readonly status: "recent" | "recommended" | "weekly";
}

export const artifactCategories = [
	"全部法宝",
	"洞府经营",
	"文书撰写",
	"数据洞察",
	"沟通协作",
	"修行辅助",
] as const;

export const featuredArtifacts: readonly ArtifactItem[] = [
	{
		category: "文书撰写",
		description: "妙笔生花，文思泉涌。智能生成各类文稿、报告、公文，文风贴合需求。",
		id: "cloud-pattern-brush",
		imageUrl: artifactLibraryAssets.artifacts.brush,
		level: 92,
		name: "云篆笔",
		status: "recent",
	},
	{
		category: "数据洞察",
		description: "洞察万象，明鉴因果。生成多维对比分析，辅助决策窥见天机。",
		id: "kunlun-mirror",
		imageUrl: artifactLibraryAssets.artifacts.mirror,
		level: 96,
		name: "昆仑镜",
		status: "weekly",
	},
];

export const artifactItems: readonly ArtifactItem[] = [
	{
		category: "修行辅助",
		description: "洞悉先机，运筹帷幄。数据建模与预测分析，捕捉趋势，辅助科学决策。",
		id: "astral-disc",
		imageUrl: artifactLibraryAssets.artifacts.disc,
		level: 88,
		name: "天机盘",
		status: "recommended",
	},
	{
		category: "知识整理",
		description: "定心凝神，风控镇守。识别风险点，生成风控建议，守护项目稳健运行。",
		id: "spirit-seal",
		imageUrl: artifactLibraryAssets.artifacts.seal,
		level: 85,
		name: "镇魂印",
		status: "recommended",
	},
	{
		category: "沟通协作",
		description: "沟通无碍，心意相通。润色表达，优化措辞，提升沟通效果与说服力。",
		id: "spirit-bell",
		imageUrl: artifactLibraryAssets.artifacts.bell,
		level: 80,
		name: "灵犀铃",
		status: "recent",
	},
	{
		category: "长文整理",
		description: "化繁为简，条理清晰。长文摘要与结构化整理，提炼要点，清晰呈现。",
		id: "jade-tablet",
		imageUrl: artifactLibraryAssets.artifacts.jadeTablet,
		level: 78,
		name: "乾坤简",
		status: "recommended",
	},
	{
		category: "自动化",
		description: "驱动流程，自动成文。自动化工作流、批量处理任务，解放双手。",
		id: "mystic-talisman",
		imageUrl: artifactLibraryAssets.artifacts.talisman,
		level: 75,
		name: "玄机符",
		status: "recommended",
	},
];

export const artifactCultivationItems = [
	{ description: "组合搭配，效果倍增", icon: "icon-[solar--magic-stick-3-linear]", title: "法宝共鸣" },
	{ description: "提升品质，增强威能", icon: "icon-[solar--stars-linear]", title: "法宝精炼" },
	{ description: "管理常用法宝与顺序", icon: "icon-[solar--settings-linear]", title: "我的法宝配置" },
] as const;
