import type { Disposable } from "./disposable.js";

/** A flat catalog: translation key → localized string. */
export type PluginLocaleCatalog = Record<string, string>;
/** Every catalog a plugin ships, keyed by locale code (e.g. "zh", "en"). */
export type PluginLocales = Record<string, PluginLocaleCatalog>;

/** Replace `{{name}}` placeholders in a resolved string with `params`. */
export function interpolatePluginText(text: string, params?: Record<string, string | number>): string {
	if (!params) return text;
	return text.replace(/\{\{(\w+)\}\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

/**
 * Resolve a bare catalog key against a plugin's catalogs. Fallback chain:
 * current-locale catalog → the plugin's `defaultLocale` catalog → the bare key
 * itself (a dev signal for a missing translation). Then interpolate `{{params}}`.
 */
export function resolveCatalogKey(
	key: string,
	locales: PluginLocales,
	currentLocale: string,
	defaultLocale: string,
	params?: Record<string, string | number>,
): string {
	const fromCurrent = locales[currentLocale]?.[key];
	const fromDefault = locales[defaultLocale]?.[key];
	return interpolatePluginText(fromCurrent ?? fromDefault ?? key, params);
}

const I18N_KEY_PATTERN = /^%([^%]+)%$/;

/**
 * Resolve a host-rendered plugin string. A value of the exact form `%key%` is a
 * catalog key (resolved via {@link resolveCatalogKey}); any other string is a
 * literal and returned unchanged — backwards compatible with bare strings.
 */
export function resolvePluginText(
	raw: string,
	locales: PluginLocales,
	currentLocale: string,
	defaultLocale: string,
	params?: Record<string, string | number>,
): string {
	const match = I18N_KEY_PATTERN.exec(raw);
	if (!match) return raw;
	return resolveCatalogKey(match[1], locales, currentLocale, defaultLocale, params);
}

export type PluginTranslate = (key: string, params?: Record<string, string | number>) => string;

/**
 * This plugin's i18n surface on the context. `locale` always equals the host's
 * current language; `t` resolves a BARE catalog key (no `%...%` wrapper) against
 * this plugin's catalogs at the current locale. Imperative — for plugin React
 * components prefer the reactive {@link useTranslation} hook.
 */
export interface PluginI18nApi {
	/** The host's current locale code (e.g. "zh"). */
	readonly locale: string;
	/** Resolve a bare catalog key at the current locale, with optional `{{params}}`. */
	t: PluginTranslate;
	/** Fired when the host language changes. */
	onChange(listener: (locale: string) => void): Disposable;
}
