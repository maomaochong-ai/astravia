import type { PluginOfficialApi } from "@astravia-org/plugin-sdk";

export function createOfficialModelsApi(
	assertOfficial: () => void,
	capabilitySessionId: string,
): PluginOfficialApi["models"] {
	const models = window.astravia.plugins.internalCapabilities.models;
	return {
		list: async () => {
			assertOfficial();
			return models.list(capabilitySessionId);
		},
		get: async (provider) => {
			assertOfficial();
			return provider ? models.getProvider(capabilitySessionId, provider) : models.getConfig(capabilitySessionId);
		},
		probe: async (provider, model) => {
			assertOfficial();
			return models.probe(capabilitySessionId, provider, model);
		},
		listProviderIds: async () => {
			assertOfficial();
			return (await models.list(capabilitySessionId)).providers.map((provider) => provider.id);
		},
		assertModelKeyExists: async (modelKey, operation) => {
			assertOfficial();
			await models.validateModelKey(capabilitySessionId, modelKey, operation);
		},
		setDefault: async (modelKey) => {
			assertOfficial();
			return models.setDefault(capabilitySessionId, modelKey);
		},
		upsertProvider: async (provider, data) => {
			assertOfficial();
			return models.upsertProvider(capabilitySessionId, provider, data);
		},
		removeProvider: async (provider) => {
			assertOfficial();
			await models.removeProvider(capabilitySessionId, provider);
		},
	};
}
