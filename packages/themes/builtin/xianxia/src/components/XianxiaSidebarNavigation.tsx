import {
	type NavIndicatorBounds,
	SidebarNavigation,
	type SidebarNavigationProps,
	type SidebarNavItem,
} from "@astravia/desktop-theme-ui/sidebar";
import { useThemePagesModel } from "@astravia/theme-sdk/pages";
import type { JSX } from "react";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";

function getNavIndicatorBounds(element: HTMLButtonElement): NavIndicatorBounds {
	return {
		height: element.offsetHeight,
		left: element.offsetLeft,
		top: element.offsetTop,
		width: element.offsetWidth,
	};
}

export function XianxiaSidebarNavigation(props: SidebarNavigationProps): JSX.Element {
	const themePages = useThemePagesModel();
	const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
	const moreButtonRef = useRef<HTMLButtonElement | null>(null);
	const themePageItems = useMemo<SidebarNavItem[]>(
		() =>
			themePages.navItems.map((item) => ({
				active: item.active,
				icon: item.icon ?? "icon-[solar--stars-linear]",
				key: item.key,
				label: item.label,
				title: item.label,
				type: "custom",
			})),
		[themePages.navItems],
	);
	const items = useMemo(
		() => [...props.items, ...themePageItems],
		[props.items, themePageItems],
	);
	const moreItems = props.moreItems ?? [];
	const moreActive = moreItems.some((item) => item.active);
	const activeMoreKey = moreItems.find((item) => item.active)?.key;
	const activeIndex = items.findIndex((item) => item.active);
	const [indicatorBounds, setIndicatorBounds] = useState<NavIndicatorBounds | null>(null);
	const setItemRef = useCallback(
		(index: number) => (element: HTMLButtonElement | null) => {
			itemRefs.current[index] = element;
			// 仅把宿主主区域项的 ref 回传（主题页追加项 index 超出宿主列表）。
			if (index < props.items.length) {
				props.setItemRef(index)(element);
			}
		},
		[props],
	);
	const setMoreButtonRef = useCallback(
		(element: HTMLButtonElement | null) => {
			moreButtonRef.current = element;
			props.setMoreButtonRef?.(element);
		},
		[props],
	);

	useLayoutEffect(() => {
		void props.moreOpen;
		void activeMoreKey;
		const activeElement = moreActive ? moreButtonRef.current : itemRefs.current[activeIndex];
		if (!activeElement) {
			setIndicatorBounds(null);
			return;
		}
		setIndicatorBounds(getNavIndicatorBounds(activeElement));
	}, [activeIndex, activeMoreKey, moreActive, props.moreOpen]);

	return (
		<SidebarNavigation
			{...props}
			indicatorBounds={indicatorBounds}
			items={items}
			moreActive={moreActive}
			onItemClick={(item) => {
				const page = themePages.navItems.find((navItem) => navItem.key === item.key);
				if (page) {
					themePages.actions.openPage(page.pageId);
					return;
				}
				props.onItemClick(item);
			}}
			setItemRef={setItemRef}
			setMoreButtonRef={setMoreButtonRef}
		/>
	);
}
