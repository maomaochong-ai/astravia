/**
 * skill 的图标目录加载。`skills.list()` 返回的 SkillInfo 不带 icon，所以命令区要拿到
 * 真实图标只能回[[开放市场]]目录查；查不到再看是不是随 App 分发的内置 Skill（图标走 renderer
 * 静态资源）。离线 / 两处都没有时返回 undefined，由 SkillTypeIcon 落默认图。
 *
 * 解析口径本身是纯逻辑，住在 lib/skill-token-meta。
 */
import { useEffect, useState } from "react";
import type { SkillIconMap } from "../lib/skill-token-meta";

export { type SkillIconMap, skillIconOf } from "../lib/skill-token-meta";

const EMPTY_ICON_MAP: SkillIconMap = new Map();

/** 缓存整份目录解析结果：命令区反复开合不该反复读盘。 */
let iconMapCache: Promise<SkillIconMap> | undefined;

/** 目录读取失败只是少几个图标，绝不让命令区打不开。 */
async function loadSkillIconMap(): Promise<SkillIconMap> {
	const map = new Map<string, string>();
	const catalog = await window.astravia.abilities.listOpenMarketplaces().catch(() => undefined);
	for (const entry of catalog?.abilities ?? []) {
		if (entry.type !== "skill") continue;
		if (!entry.icon) continue;
		const key = `${entry.type}:${entry.slug}`;
		if (!map.has(key)) map.set(key, entry.icon);
	}
	return map;
}

/**
 * enabled 为 false 时不发起加载：命令区没展开过就不该为图标去读目录。
 *
 * `prefetch` 为真时提前读：等展开那一刻才发起的话，结果会在高度动画进行中才到位，
 * 整列图标同时换图，动画就顿在那里。
 */
export function useSkillIconMap(enabled: boolean, prefetch = false): SkillIconMap {
	const [map, setMap] = useState<SkillIconMap>(EMPTY_ICON_MAP);

	useEffect(() => {
		if (!enabled && !prefetch) return;
		let alive = true;
		iconMapCache ??= loadSkillIconMap();
		void iconMapCache.then((next) => {
			if (alive) setMap(next);
		});
		return () => {
			alive = false;
		};
	}, [enabled, prefetch]);

	return map;
}
