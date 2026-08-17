/**
 * Feature flags driven by environment variables.
 *
 * Renderer: values are inlined at Vite build/dev start via `vite.config.ts` define.
 * Main: reads `process.env` at runtime (also inlined when present in `.env.<mode>` via main Vite define).
 */

/** 外观设置「界面主题」区段：默认不展示；`ASTRAVIA_SHOW_UI_THEME=true` 时展示。 */
export const APPEARANCE_UI_THEME_ENV = "ASTRAVIA_SHOW_UI_THEME";

export function isAppearanceUiThemeEnabled(): boolean {
	return process.env.ASTRAVIA_SHOW_UI_THEME === "true";
}
