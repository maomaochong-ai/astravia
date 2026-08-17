import type { PluginOfficialApi, PluginOfficialPluginSummary } from "@astravia-org/plugin-sdk";
import type { InstalledPlugin } from "@preload/api";

function summarizePlugin(plugin: InstalledPlugin): PluginOfficialPluginSummary {
	return {
		id: plugin.id,
		name: plugin.name,
		version: plugin.version,
		enabled: plugin.enabled,
		required: plugin.required,
		source: plugin.source,
		permissions: plugin.grantedPermissions,
		description: plugin.description,
		devWatch: plugin.devWatch,
	};
}

export function createOfficialPluginsApi(
	assertOfficial: () => void,
	capabilitySessionId: string,
): PluginOfficialApi["plugins"] {
	const pluginSystem = window.astravia.plugins.internalCapabilities.pluginSystem;
	return {
		list: async () => {
			assertOfficial();
			return (await pluginSystem.list(capabilitySessionId)).map(summarizePlugin);
		},
		get: async (id) => {
			assertOfficial();
			const plugin = (await pluginSystem.list(capabilitySessionId)).find((item) => item.id === id);
			if (!plugin) throw new Error(`Plugin not found: ${id}`);
			return summarizePlugin(plugin);
		},
		setEnabled: async (id, enabled) => {
			assertOfficial();
			return summarizePlugin(await pluginSystem.setEnabled(capabilitySessionId, id, enabled));
		},
		installFromUrl: async (url) => {
			assertOfficial();
			return summarizePlugin(await pluginSystem.installFromUrl(capabilitySessionId, url));
		},
		installFromPath: async (path, options) => {
			assertOfficial();
			return summarizePlugin(await pluginSystem.installFromPath(capabilitySessionId, path, options));
		},
		uninstall: async (id) => {
			assertOfficial();
			await pluginSystem.uninstall(capabilitySessionId, id);
		},
		reload: async (id) => {
			assertOfficial();
			return summarizePlugin(await pluginSystem.reload(capabilitySessionId, id));
		},
	};
}
