export interface SanctumAchievement {
	readonly achieved: boolean;
	readonly englishName: string;
	readonly id: string;
	readonly level: number;
	readonly name: string;
}

export const sanctumAchievements: readonly SanctumAchievement[] = [
	{ achieved: true, englishName: "Qi Refining", id: "qi-refining", level: 1, name: "炼气境" },
	{ achieved: true, englishName: "Foundation Establishment", id: "foundation-establishment", level: 2, name: "筑基境" },
	{ achieved: false, englishName: "Core Formation", id: "core-formation", level: 3, name: "金丹境" },
	{ achieved: false, englishName: "Nascent Soul", id: "nascent-soul", level: 4, name: "元婴境" },
	{ achieved: false, englishName: "Spirit Severing", id: "spirit-severing", level: 5, name: "化神境" },
	{ achieved: false, englishName: "Void Refinement", id: "void-refinement", level: 6, name: "炼虚境" },
	{ achieved: false, englishName: "Body Integration", id: "body-integration", level: 7, name: "合体境" },
	{ achieved: false, englishName: "Mahayana", id: "mahayana", level: 8, name: "大乘境" },
	{ achieved: false, englishName: "Tribulation Transcendence", id: "tribulation-transcendence", level: 9, name: "渡劫境" },
	{ achieved: false, englishName: "Earth Immortal", id: "earth-immortal", level: 10, name: "地仙境" },
	{ achieved: false, englishName: "Heavenly Immortal", id: "heavenly-immortal", level: 11, name: "天仙境" },
	{ achieved: false, englishName: "Golden Immortal", id: "golden-immortal", level: 12, name: "金仙境" },
	{
		achieved: false,
		englishName: "Taiyi Golden Immortal",
		id: "taiyi-golden-immortal",
		level: 13,
		name: "太乙金仙境",
	},
	{
		achieved: false,
		englishName: "Daluo Golden Immortal",
		id: "daluo-golden-immortal",
		level: 14,
		name: "大罗金仙境",
	},
	{ achieved: false, englishName: "Saint Realm", id: "saint-realm", level: 15, name: "圣境" },
];
