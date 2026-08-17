import {
	type CapabilityJsonValue,
	FOUNDATION_NETWORK_CAPABILITIES,
	parseCapabilityJsonValue,
} from "../../../foundation.js";
import { PLUGIN_CAPABILITY_PERMISSIONS, type PluginCapabilitySessionAccess } from "../types.js";

export const pluginNetworkMethods = {
	requestNetwork(
		this: PluginCapabilitySessionAccess,
		sessionId: string,
		request: unknown,
	): Promise<CapabilityJsonValue> {
		return this.client(sessionId, { permission: PLUGIN_CAPABILITY_PERMISSIONS.NETWORK_FETCH }).invoke(
			FOUNDATION_NETWORK_CAPABILITIES.REQUEST,
			{
				request: parseCapabilityJsonValue(request),
			},
		);
	},
};

export type PluginNetworkMethods = typeof pluginNetworkMethods;
