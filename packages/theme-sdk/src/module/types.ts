import type { ComponentType } from "react";
import type { ThemeAppearance } from "../appearance";
import type { ThemePageDefinition } from "../pages";

export interface ThemeMeta {
	readonly id: string;
	readonly name: string;
	readonly sdkVersion: string;
	readonly version: string;
}

export interface ThemeRegionRegistry {}

export interface ThemeComponentRegistry {}

export type ThemeRegionId = Extract<keyof ThemeRegionRegistry, string>;

export type ThemeComponentId = Extract<keyof ThemeComponentRegistry, string>;

/**
 * Always-mounted theme runtime component (effects, progression sync, etc.).
 * Rendered by the host while the theme is active; should typically return null.
 */
export type ThemeRuntimeComponent = ComponentType;

export interface ThemeModule {
	readonly appearance?: ThemeAppearance;
	readonly components?: Partial<ThemeComponentRegistry>;
	readonly meta: ThemeMeta;
	readonly pages?: readonly ThemePageDefinition[];
	readonly regions?: Partial<ThemeRegionRegistry>;
	/** Headless runtime effects mounted for the active theme (no UI required). */
	readonly runtime?: readonly ThemeRuntimeComponent[];
}

export const DEFAULT_THEME_MODULE: ThemeModule = {
	meta: {
		id: "default",
		name: "Default",
		sdkVersion: "0.1.0",
		version: "0.1.0",
	},
};
