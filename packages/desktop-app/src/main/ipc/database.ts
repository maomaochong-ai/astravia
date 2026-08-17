import { ipcMain } from "electron";
import { databaseService } from "../database/database-service.js";

/**
 * 数据库能力 IPC 注册（main 进程）。
 *
 * 通道前缀统一 `astravia:database:`，与 renderer 抽象层
 * （domains/database）一一对应。所有 handler 直接转发给
 * databaseService（返回值已是 DatabaseResult，跨 IPC 无损）。
 */

const CHANNELS = {
	LIST_CONNECTIONS: "astravia:database:list-connections",
	ADD_CONNECTION: "astravia:database:add-connection",
	TEST_CONNECTION: "astravia:database:test-connection",
	REMOVE_CONNECTION: "astravia:database:remove-connection",
	LIST_TABLES: "astravia:database:list-tables",
	DESCRIBE_TABLE: "astravia:database:describe-table",
	EXECUTE_QUERY: "astravia:database:execute-query",
	GET_SCHEMA_CONTEXT: "astravia:database:get-schema-context",
} as const;

export function registerDatabaseIpc(): () => void {
	const removeHandlers: Array<() => void> = [];

	const register = (channel: string, handler: (...args: unknown[]) => unknown): void => {
		ipcMain.handle(channel, (_event, ...args: unknown[]) => handler(...args));
		removeHandlers.push(() => ipcMain.removeHandler(channel));
	};

	register(CHANNELS.LIST_CONNECTIONS, () => databaseService.listConnections());
	register(CHANNELS.ADD_CONNECTION, (params: unknown) =>
		databaseService.addConnection(params as Parameters<typeof databaseService.addConnection>[0]),
	);
	register(CHANNELS.TEST_CONNECTION, (params: unknown) =>
		databaseService.testConnection(params as Parameters<typeof databaseService.testConnection>[0]),
	);
	register(CHANNELS.REMOVE_CONNECTION, (id: unknown) => databaseService.removeConnection(id as string));
	register(CHANNELS.LIST_TABLES, (connectionName: unknown) => databaseService.listTables(connectionName as string));
	register(CHANNELS.DESCRIBE_TABLE, (connectionName: unknown, table: unknown) =>
		databaseService.describeTable(connectionName as string, table as string),
	);
	register(CHANNELS.EXECUTE_QUERY, (connectionName: unknown, sql: unknown) =>
		databaseService.executeQuery(connectionName as string, sql as string),
	);
	register(CHANNELS.GET_SCHEMA_CONTEXT, (connectionName: unknown) =>
		databaseService.getSchemaContext(connectionName as string),
	);

	return () => {
		for (const remove of removeHandlers) remove();
	};
}
