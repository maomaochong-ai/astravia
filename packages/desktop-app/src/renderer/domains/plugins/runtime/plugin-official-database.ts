import type { PluginOfficialApi } from "@astravia-org/plugin-sdk";

export function createOfficialDatabaseApi(
	assertOfficial: () => void,
	capabilitySessionId: string,
): PluginOfficialApi["database"] {
	const database = window.astravia.plugins.internalCapabilities.database;
	return {
		list: async () => {
			assertOfficial();
			return database.listConnections(capabilitySessionId);
		},
		add: async (input) => {
			assertOfficial();
			return database.addConnection(capabilitySessionId, input);
		},
		test: async (input) => {
			assertOfficial();
			return database.testConnection(capabilitySessionId, input);
		},
		remove: async (id) => {
			assertOfficial();
			await database.removeConnection(capabilitySessionId, id);
		},
	};
}
