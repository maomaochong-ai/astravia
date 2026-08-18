import { type Static, Type } from "@sinclair/typebox";
import { createCapabilityCatalog } from "../catalog.js";
import { CAPABILITY_LAYERS, defineCapability } from "../contracts.js";
import {
	defineCapabilityInputSchema,
	defineCapabilityNoOutputSchema,
	defineCapabilityOutputSchema,
} from "../schema.js";

const databaseEmptyInputType = Type.Unsafe<Record<string, never>>({
	type: "object",
	additionalProperties: false,
});

/** 数据库连接（与 desktop preload api-types/database.ts 的 DbConnection 语义对齐）。 */
const databaseConnectionType = Type.Object(
	{
		id: Type.String(),
		name: Type.String(),
		groupPath: Type.String(),
		type: Type.String(),
		host: Type.String(),
		port: Type.Number(),
		database: Type.String(),
	},
	{ additionalProperties: false },
);

/** 新增连接的参数。 */
const databaseAddConnectionInputType = Type.Object(
	{
		name: Type.String({ pattern: "\\S" }),
		dbType: Type.String({ pattern: "\\S" }),
		host: Type.String({ pattern: "\\S" }),
		port: Type.Optional(Type.Number()),
		username: Type.Optional(Type.String()),
		password: Type.Optional(Type.String()),
		database: Type.Optional(Type.String()),
		ssl: Type.Optional(Type.Boolean()),
	},
	{ additionalProperties: false },
);

/** 连接测试输入：已保存连接按名称测试，未保存的表单按草稿参数测试。 */
const databaseTestConnectionInputType = Type.Object(
	{
		connectionName: Type.Optional(Type.String({ pattern: "\\S" })),
		draft: Type.Optional(databaseAddConnectionInputType),
	},
	{ additionalProperties: false },
);

const databaseConnectionSummaryType = Type.Object(
	{
		id: Type.String(),
		name: Type.String(),
	},
	{ additionalProperties: false },
);

const databaseConnectionTestResultType = Type.Object(
	{
		tableCount: Type.Number({ minimum: 0 }),
		detail: Type.String(),
	},
	{ additionalProperties: false },
);

const databaseRemoveConnectionInputType = Type.Object(
	{
		id: Type.String({ pattern: "\\S" }),
	},
	{ additionalProperties: false },
);

export type DatabaseConnection = Readonly<Static<typeof databaseConnectionType>>;
export type DatabaseAddConnectionInput = Readonly<Static<typeof databaseAddConnectionInputType>>;
export type DatabaseTestConnectionInput = Readonly<Static<typeof databaseTestConnectionInputType>>;
export type DatabaseConnectionSummary = Readonly<Static<typeof databaseConnectionSummaryType>>;
export type DatabaseConnectionTestResult = Readonly<Static<typeof databaseConnectionTestResultType>>;
export type DatabaseRemoveConnectionInput = Readonly<Static<typeof databaseRemoveConnectionInputType>>;

const databaseConnectionsOutputSchema = defineCapabilityOutputSchema(Type.Array(databaseConnectionType), {
	clean: true,
});
const databaseConnectionSummaryOutputSchema = defineCapabilityOutputSchema(databaseConnectionSummaryType, {
	clean: true,
});
const databaseConnectionTestResultOutputSchema = defineCapabilityOutputSchema(databaseConnectionTestResultType, {
	clean: true,
});
const databaseAddConnectionInputSchema = defineCapabilityInputSchema(databaseAddConnectionInputType, { clean: true });
const databaseTestConnectionInputSchema = defineCapabilityInputSchema(databaseTestConnectionInputType, {
	clean: true,
});
const databaseRemoveConnectionInputSchema = defineCapabilityInputSchema(databaseRemoveConnectionInputType, {
	clean: true,
});
const databaseNoOutputSchema = defineCapabilityNoOutputSchema();

export const DOMAIN_DATABASE_CAPABILITIES = {
	LIST_CONNECTIONS: defineCapability<Record<string, never>, DatabaseConnection[]>({
		id: "cap.domain.astravia.database.connection.list",
		kind: "query",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		input: defineCapabilityInputSchema(databaseEmptyInputType),
		output: databaseConnectionsOutputSchema,
	}),
	ADD_CONNECTION: defineCapability<DatabaseAddConnectionInput, DatabaseConnectionSummary>({
		id: "cap.domain.astravia.database.connection.add",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		input: databaseAddConnectionInputSchema,
		output: databaseConnectionSummaryOutputSchema,
	}),
	TEST_CONNECTION: defineCapability<DatabaseTestConnectionInput, DatabaseConnectionTestResult>({
		id: "cap.domain.astravia.database.connection.test",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		input: databaseTestConnectionInputSchema,
		output: databaseConnectionTestResultOutputSchema,
	}),
	REMOVE_CONNECTION: defineCapability<DatabaseRemoveConnectionInput, undefined>({
		id: "cap.domain.astravia.database.connection.remove",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		input: databaseRemoveConnectionInputSchema,
		output: databaseNoOutputSchema,
	}),
} as const;

export const DOMAIN_DATABASE_CAPABILITY_CATALOG = createCapabilityCatalog(Object.values(DOMAIN_DATABASE_CAPABILITIES));
