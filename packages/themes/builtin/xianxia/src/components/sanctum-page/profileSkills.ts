import { levelFromXp } from "./abilityProgress";
import type { SanctumCultivationView } from "./types";

export interface ProfileSkillView {
	readonly id: "automation" | "dialogue" | "knowledge" | "practice";
	readonly label: string;
	readonly level: number;
	readonly value: number;
}

/** Map every cultivation score component into one of the four fixed profile skill slots. */
export function getProfileSkills(cultivation: SanctumCultivationView): readonly ProfileSkillView[] {
	const breakdown = cultivation.scoreBreakdown;
	const skills = [
		{
			id: "dialogue",
			label: "对话协作",
			value: breakdown.messages + breakdown.turns + breakdown.depth,
		},
		{
			id: "practice",
			label: "活跃实践",
			value: breakdown.activeTime + breakdown.sessions + breakdown.tokens + breakdown.projects,
		},
		{
			id: "knowledge",
			label: "工具知识",
			value: breakdown.tools + breakdown.knowledge,
		},
		{
			id: "automation",
			label: "自动修炼",
			value: breakdown.batch + breakdown.automation + breakdown.streak,
		},
	] as const;

	return skills.map((skill) => ({
		...skill,
		level: levelFromXp(skill.value).level,
	}));
}
