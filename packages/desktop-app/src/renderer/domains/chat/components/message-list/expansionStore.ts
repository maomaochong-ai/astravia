/**
 * 消息列表里所有「展开/收起」态的外置存储。
 *
 * 消息列表跑在 Virtuoso 上：条目展开后变高，一旦超出 overscan 视窗就会被卸载再挂回，
 * 组件内的 `useState` 会随之归零——表现为「点开后又自己折回去」（插件自定义 UI 工具
 * 面板尤其明显，因为它最高）。因此展开态必须活在组件树之外，按稳定 id 记住。
 */

import { atom, useAtom } from "jotai";
import { useCallback } from "react";

const expandedKeysAtom = atom<Record<string, boolean>>({});

/** 按稳定 key 记住展开态，跨 Virtuoso 卸载/重挂存活。 */
export function useExpansion(key: string, defaultExpanded = false): [boolean, () => void] {
	const [map, setMap] = useAtom(expandedKeysAtom);
	const expanded = map[key] ?? defaultExpanded;
	const toggle = useCallback(() => {
		setMap((previous) => ({ ...previous, [key]: !(previous[key] ?? defaultExpanded) }));
	}, [key, defaultExpanded, setMap]);
	return [expanded, toggle];
}
