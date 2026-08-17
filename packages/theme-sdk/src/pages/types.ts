import type { ComponentType } from "react";

export type ThemePageLayout = "content" | "main" | "app";

export interface ThemePageProps {
	readonly layout: ThemePageLayout;
	readonly pageId: string;
	readonly themeId: string;
}

export interface ThemePageDefinition {
	readonly component: ComponentType<ThemePageProps>;
	readonly id: string;
	readonly layout?: ThemePageLayout;
	readonly nav?: {
		readonly icon?: string;
		readonly order?: number;
	};
	readonly title: Readonly<Record<string, string>>;
}

export interface ThemePageNavItem {
	readonly active: boolean;
	readonly icon?: string;
	readonly key: string;
	readonly label: string;
	readonly pageId: string;
}

export interface ThemePagesModel {
	readonly actions: {
		readonly openPage: (pageId: string) => void;
	};
	readonly navItems: readonly ThemePageNavItem[];
}

export interface ThemePagesThemeHost {
	readonly useThemePagesModel: () => ThemePagesModel;
}
