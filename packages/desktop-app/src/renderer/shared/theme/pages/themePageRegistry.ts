import type { ThemeModule, ThemePageDefinition, ThemePageLayout } from "@astravia/theme-sdk";

export const THEME_PAGE_ROUTE_PATH = "/theme/$themeId/$pageId";

const THEME_PAGE_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;

export function isValidThemePageId(id: string): boolean {
	return THEME_PAGE_ID_PATTERN.test(id);
}

export function getThemePageLayout(page: ThemePageDefinition): ThemePageLayout {
	switch (page.layout) {
		case "app":
		case "main":
		case "content":
			return page.layout;
		default:
			return "content";
	}
}

export function findThemePage(
	theme: ThemeModule,
	themeId: string | undefined,
	pageId: string | undefined,
): ThemePageDefinition | undefined {
	if (!themeId || !pageId) return undefined;
	if (theme.meta.id !== themeId || !isValidThemePageId(pageId)) return undefined;
	return theme.pages?.find((page) => page.id === pageId && isValidThemePageId(page.id));
}

export function resolveThemePageTitle(title: Readonly<Record<string, string>>, language: string): string {
	const baseLanguage = language.split("-")[0];
	return title[language] ?? title[baseLanguage] ?? title["zh-CN"] ?? title["en-US"] ?? Object.values(title)[0] ?? "";
}
