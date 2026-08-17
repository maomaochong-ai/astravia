import { useThemeModule } from "@astravia/theme-sdk";
import type { ThemePagesModel } from "@astravia/theme-sdk/pages";
import { useMatches, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { isValidThemePageId, resolveThemePageTitle } from "./themePageRegistry";

export function useThemePagesModel(): ThemePagesModel {
	const theme = useThemeModule();
	const { i18n } = useTranslation();
	const navigate = useNavigate();
	const matches = useMatches();
	const currentPath = matches[matches.length - 1]?.pathname ?? "/";
	const navItems = [...(theme.pages ?? [])]
		.filter((page) => isValidThemePageId(page.id))
		.sort((left, right) => (left.nav?.order ?? 0) - (right.nav?.order ?? 0) || left.id.localeCompare(right.id))
		.map((page) => {
			const path = `/theme/${theme.meta.id}/${page.id}`;
			return {
				active: currentPath === path,
				icon: page.nav?.icon,
				key: path,
				label: resolveThemePageTitle(page.title, i18n.language),
				pageId: page.id,
			};
		});

	return {
		navItems,
		actions: {
			openPage: (pageId) => {
				void navigate({
					to: "/theme/$themeId/$pageId",
					params: { themeId: theme.meta.id, pageId },
				});
			},
		},
	};
}
