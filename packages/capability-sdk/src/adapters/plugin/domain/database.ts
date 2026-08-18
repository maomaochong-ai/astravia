import {
	type DatabaseAddConnectionInput,
	type DatabaseConnection,
	type DatabaseConnectionSummary,
	type DatabaseConnectionTestResult,
	type DatabaseTestConnectionInput,
	DOMAIN_DATABASE_CAPABILITIES,
} from "../../../domain.js";
import type { PluginCapabilitySessionAccess } from "../types.js";

export const pluginDatabaseMethods = {
	listDatabaseConnections(this: PluginCapabilitySessionAccess, sessionId: string): Promise<DatabaseConnection[]> {
		return this.client(sessionId, { official: true }).invoke(DOMAIN_DATABASE_CAPABILITIES.LIST_CONNECTIONS, {});
	},

	addDatabaseConnection(
		this: PluginCapabilitySessionAccess,
		sessionId: string,
		data: DatabaseAddConnectionInput,
	): Promise<DatabaseConnectionSummary> {
		const input = DOMAIN_DATABASE_CAPABILITIES.ADD_CONNECTION.parseInput(data);
		return this.client(sessionId, { official: true }).invoke(DOMAIN_DATABASE_CAPABILITIES.ADD_CONNECTION, input);
	},

	testDatabaseConnection(
		this: PluginCapabilitySessionAccess,
		sessionId: string,
		input: DatabaseTestConnectionInput,
	): Promise<DatabaseConnectionTestResult> {
		const parsed = DOMAIN_DATABASE_CAPABILITIES.TEST_CONNECTION.parseInput(input);
		return this.client(sessionId, { official: true }).invoke(DOMAIN_DATABASE_CAPABILITIES.TEST_CONNECTION, parsed);
	},

	removeDatabaseConnection(this: PluginCapabilitySessionAccess, sessionId: string, id: string): Promise<undefined> {
		return this.client(sessionId, { official: true }).invoke(DOMAIN_DATABASE_CAPABILITIES.REMOVE_CONNECTION, {
			id,
		});
	},
};

export type PluginDatabaseMethods = typeof pluginDatabaseMethods;
