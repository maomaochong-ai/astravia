import type { CultivationRealmDefinition } from "./types";

/**
 * Realm ladder for xianxia cultivation.
 * Gates are cultivation scores computed from app-monitor aggregates
 * (`computeCultivationScore`), not settings / fanren achievement thresholds.
 */
export const CULTIVATION_REALMS: readonly CultivationRealmDefinition[] = [
	{ id: "qi-refining", level: 1, name: "炼气境", englishName: "Qi Refining", targetScore: 0 },
	{
		id: "foundation-establishment",
		level: 2,
		name: "筑基境",
		englishName: "Foundation Establishment",
		targetScore: 50,
	},
	{
		id: "core-formation",
		level: 3,
		name: "金丹境",
		englishName: "Core Formation",
		targetScore: 150,
	},
	{
		id: "nascent-soul",
		level: 4,
		name: "元婴境",
		englishName: "Nascent Soul",
		targetScore: 400,
	},
	{
		id: "spirit-severing",
		level: 5,
		name: "化神境",
		englishName: "Spirit Severing",
		targetScore: 900,
	},
	{
		id: "void-refinement",
		level: 6,
		name: "炼虚境",
		englishName: "Void Refinement",
		targetScore: 1_800,
	},
	{
		id: "body-integration",
		level: 7,
		name: "合体境",
		englishName: "Body Integration",
		targetScore: 3_500,
	},
	{
		id: "mahayana",
		level: 8,
		name: "大乘境",
		englishName: "Mahayana",
		targetScore: 6_500,
	},
	{
		id: "tribulation-transcendence",
		level: 9,
		name: "渡劫境",
		englishName: "Tribulation Transcendence",
		targetScore: 11_000,
	},
	{
		id: "earth-immortal",
		level: 10,
		name: "地仙境",
		englishName: "Earth Immortal",
		targetScore: 18_000,
	},
	{
		id: "heavenly-immortal",
		level: 11,
		name: "天仙境",
		englishName: "Heavenly Immortal",
		targetScore: 28_000,
	},
	{
		id: "golden-immortal",
		level: 12,
		name: "金仙境",
		englishName: "Golden Immortal",
		targetScore: 42_000,
	},
	{
		id: "taiyi-golden-immortal",
		level: 13,
		name: "太乙金仙境",
		englishName: "Taiyi Golden Immortal",
		targetScore: 60_000,
	},
	{
		id: "daluo-golden-immortal",
		level: 14,
		name: "大罗金仙境",
		englishName: "Daluo Golden Immortal",
		targetScore: 85_000,
	},
	{
		id: "saint-realm",
		level: 15,
		name: "圣境",
		englishName: "Saint Realm",
		targetScore: 120_000,
	},
];
