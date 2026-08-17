/** Ability XP floors for Lv.1-Lv.5. */
export const ABILITY_LEVEL_XP_THRESHOLDS = [0, 50, 150, 350, 700] as const;

export interface AbilityProgress {
	readonly complete: boolean;
	readonly level: number;
	readonly progress: number;
	readonly targetXp: number;
}

/** Resolve the current ability level and its next absolute XP target. */
export function getAbilityProgress(xp: number): AbilityProgress {
	const value = Math.max(0, xp);
	const thresholds = ABILITY_LEVEL_XP_THRESHOLDS;
	let level = 1;
	for (let index = thresholds.length - 1; index >= 0; index--) {
		if (value >= thresholds[index]) {
			level = index + 1;
			break;
		}
	}
	if (level >= thresholds.length) {
		return {
			complete: true,
			level: thresholds.length,
			progress: 100,
			targetXp: thresholds[thresholds.length - 1],
		};
	}
	const floor = thresholds[level - 1];
	const next = thresholds[level];
	return {
		complete: false,
		level,
		progress: Math.round(((value - floor) / Math.max(1, next - floor)) * 100),
		targetXp: next,
	};
}

/** Convert absolute score contribution into a stable ability level and progress. */
export function levelFromXp(xp: number): { readonly level: number; readonly progress: number } {
	const ability = getAbilityProgress(xp);
	return {
		level: ability.level,
		progress: ability.complete ? 100 : Math.max(8, Math.min(99, ability.progress)),
	};
}
