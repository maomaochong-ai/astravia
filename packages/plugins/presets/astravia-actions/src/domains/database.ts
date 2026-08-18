import type { PluginAppActionExample, PluginContext, PluginJsonSchema, PluginOfficialApi } from "@astravia-org/plugin-sdk";
import { throwEntityNotFound } from "../action-errors";

type PluginOfficialDatabaseAddInput = Parameters<PluginOfficialApi["database"]["add"]>[0];
type PluginOfficialDatabaseTestInput = Parameters<PluginOfficialApi["database"]["test"]>[0];

type DatabaseQueryInput =
	| { operation: "help" }
	| { operation: "list" };

type DatabaseManageInput =
	| { operation: "add"; data: PluginOfficialDatabaseAddInput }
	| { operation: "test"; input: PluginOfficialDatabaseTestInput }
	| { operation: "remove"; id: string };

const querySchema: PluginJsonSchema = {
	type: "object",
	oneOf: [
		{ properties: { operation: { const: "help" } }, required: ["operation"], additionalProperties: false },
		{ properties: { operation: { const: "list" } }, required: ["operation"], additionalProperties: false },
	],
};

const manageSchema: PluginJsonSchema = {
	type: "object",
	oneOf: [
		{
			properties: {
				operation: { const: "add" },
				data: {
					type: "object",
					properties: {
						name: { type: "string", minLength: 1 },
						dbType: { type: "string", minLength: 1 },
						host: { type: "string", minLength: 1 },
						port: { type: "integer", minimum: 1, maximum: 65535 },
						username: { type: "string", minLength: 1 },
						password: { type: "string" },
						database: { type: "string", minLength: 1 },
						ssl: { type: "boolean" },
					},
					required: ["name", "dbType", "host"],
					additionalProperties: false,
				},
			},
			required: ["operation", "data"],
			additionalProperties: false,
		},
		{
			properties: {
				operation: { const: "test" },
				input: {
					type: "object",
					properties: {
						connectionName: { type: "string", minLength: 1 },
						draft: {
							type: "object",
							properties: {
								name: { type: "string", minLength: 1 },
								dbType: { type: "string", minLength: 1 },
								host: { type: "string", minLength: 1 },
								port: { type: "integer", minimum: 1, maximum: 65535 },
								username: { type: "string", minLength: 1 },
								password: { type: "string" },
								database: { type: "string", minLength: 1 },
								ssl: { type: "boolean" },
							},
							required: ["name", "dbType", "host"],
							additionalProperties: false,
						},
					},
					additionalProperties: false,
				},
			},
			required: ["operation", "input"],
			additionalProperties: false,
		},
		{
			properties: {
				operation: { const: "remove" },
				id: { type: "string", minLength: 1 },
			},
			required: ["operation", "id"],
			additionalProperties: false,
		},
	],
};

const queryExamples: PluginAppActionExample<DatabaseQueryInput>[] = [
	{ description: "列出数据库连接", input: { operation: "list" } },
];

const manageExamples: PluginAppActionExample<DatabaseManageInput>[] = [
	{
		description: "新增数据库连接",
		input: { operation: "add", data: { name: "本地开发库", dbType: "mysql", host: "127.0.0.1", port: 3306, database: "app" } },
	},
	{ description: "测试连接", input: { operation: "test", input: { connectionName: "本地开发库" } } },
	{ description: "删除连接", input: { operation: "remove", id: "conn_abc123" } },
];

export function registerDatabaseActions(ctx: PluginContext): void {
	ctx.appActions.register<DatabaseQueryInput>({
		id: "database.query",
		publicId: "database.query",
		title: "查询数据库连接",
		summary: "列出数据库连接。",
		description: '对象参数；operation 为 "help" 或 "list"。',
		keywords: ["数据库", "连接", "database", "connection"],
		effect: "read",
		inputSchema: querySchema,
		examples: queryExamples,
		handler: async ({ input }) => {
			if (input.operation === "help") {
				return {
					guidance: "数据库连接实体都在 database.*。list 列出全部连接；manage 的新增/测试/删除对应设置 → 数据库。",
					actions: [
						{ id: "database.query", inputSchema: querySchema, examples: queryExamples },
						{ id: "database.manage", inputSchema: manageSchema, examples: manageExamples },
					],
				};
			}
			return ctx.official.database.list();
		},
	});

	ctx.appActions.register<DatabaseManageInput>({
		id: "database.manage",
		publicId: "database.manage",
		title: "管理数据库连接",
		summary: "新增/测试/删除数据库连接。",
		description: '对象参数；operation 为 "add"、"test" 或 "remove"。',
		keywords: ["数据库", "连接", "database", "connection", "add", "test", "remove"],
		effect: "write",
		timeoutMs: 120_000,
		approval: {
			defaultPresentation: "database.add",
			presentations: [
				{ id: "database.add", title: "新增数据库连接确认", description: "展示并可编辑连接信息。" },
				{ id: "database.test", title: "测试数据库连接确认", description: "展示待测试的连接。" },
				{ id: "database.remove", title: "删除数据库连接确认", description: "展示待删除的连接。" },
			],
			presentationByOperation: {
				add: "database.add",
				test: "database.test",
				remove: "database.remove",
			},
		},
		inputSchema: manageSchema,
		examples: manageExamples,
		assertReady: async ({ input }) => {
			if (input.operation === "remove") {
				const connections = await ctx.official.database.list();
				const ids = connections.map((item) => item.id);
				if (ids.includes(input.id)) return;
				throwEntityNotFound({
					operation: input.operation,
					entity: "database connection",
					idField: "id",
					id: input.id,
					queryAction: "database.query",
					queryExample: { operation: "list" },
					resultIdPath: "list result array items[].id",
					availableIds: ids,
				});
			}
		},
		handler: async ({ input }) => {
			switch (input.operation) {
				case "add":
					return { operation: input.operation, ...(await ctx.official.database.add(input.data)) };
				case "test":
					return { operation: input.operation, ...(await ctx.official.database.test(input.input)) };
				case "remove":
					await ctx.official.database.remove(input.id);
					return { operation: input.operation, id: input.id };
			}
		},
	});
}
