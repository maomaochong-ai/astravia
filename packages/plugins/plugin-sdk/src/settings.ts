import type { Disposable } from "./disposable.js";

/**
 * Read-side access to this plugin's settings (the values configured against
 * the `contributes.settings` schema declared in plugin.json, namespaced by
 * plugin id). Writes go through the host's settings UI, not the plugin.
 */
export interface PluginSettingsApi {
	get<T = unknown>(key: string): T | undefined;
	getAll(): Record<string, unknown>;
	/** Fired when any of this plugin's setting values change. */
	onChange(listener: (values: Record<string, unknown>) => void): Disposable;
}
