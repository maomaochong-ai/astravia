import type { PluginAppActionExample, PluginContext, PluginJsonSchema } from "@astravia-org/plugin-sdk";
import { throwInvalidInput } from "../action-errors";

type ImQueryInput =
	| { operation: "help" }
	| { operation: "status" }
	| { operation: "logs"; limit?: number };
type ImManageInput =
	| { operation: "set-enabled"; enabled: boolean }
	| { operation: "restart" }
	| { operation: "set-agent-model"; modelKey: string | null; reasoningLevel?: string };

const querySchema: PluginJsonSchema = {
	type: "object",
	oneOf: [
		{ properties: { operation: { const: "help" } }, required: ["operation"], additionalProperties: false },
		{ properties: { operation: { const: "status" } }, required: ["operation"], additionalProperties: false },
		{
			properties: {
				operation: { const: "logs" },
				limit: { type: "integer", minimum: 1, maximum: 200 },
			},
			required: ["operation"],
			additionalProperties: false,
		},
	],
};

const manageSchema: PluginJsonSchema = {
	type: "object",
	oneOf: [
		{
			properties: {
				operation: { const: "set-enabled" },
				enabled: { type: "boolean" },
			},
			required: ["operation", "enabled"],
			additionalProperties: false,
		},
		{ properties: { operation: { const: "restart" } }, required: ["operation"], additionalProperties: false },
		{
			properties: {
				operation: { const: "set-agent-model" },
				modelKey: { type: ["string", "null"], minLength: 1 },
				reasoningLevel: { type: "string", minLength: 1 },
			},
			required: ["operation", "modelKey"],
			additionalProperties: false,
		},
	],
};

const queryExamples: PluginAppActionExample<ImQueryInput>[] = [
	{ description: "查看 IM 状态", input: { operation: "status" } },
];
const manageExamples: PluginAppActionExample<ImManageInput>[] = [
	{ description: "启用 IM", input: { operation: "set-enabled", enabled: true } },
	{ description: "重启 IM", input: { operation: "restart" } },
];

export function registerImActions(ctx: PluginContext): void {
	ctx.appActions.register<ImQueryInput>({
		id: "im.query",
		publicId: "im.query",
		title: "查询 IM/Claw 状态",
		summary: "查看 IM 旁路桥接运行状态与日志。",
		description: '对象参数；operation 为 "help"、"status" 或 "logs"。不返回密钥。',
		keywords: ["im", "claw", "飞书", "微信", "旁路", "sidecar"],
		effect: "read",
		inputSchema: querySchema,
		examples: queryExamples,
		handler: async ({ input }) => {
			if (input.operation === "help") {
				return {
					guidance: "绑定凭证请在设置 → Claw 完成；Action 可启停、重启与设置 agentModel。",
					actions: [
						{ id: "im.query", inputSchema: querySchema, examples: queryExamples },
						{ id: "im.manage", inputSchema: manageSchema, examples: manageExamples },
					],
				};
			}
			if (input.operation === "status") return ctx.official.im.getStatus();
			return { logs: await ctx.official.im.getLogs(input.limit ?? 50) };
		},
	});
	ctx.appActions.register<ImManageInput>({
		id: "im.manage",
		publicId: "im.manage",
		title: "管理 IM/Claw",
		summary: "启用/停用 IM 桥接、重启或设置对话模型。",
		description:
			'对象参数；operation 为 "set-enabled"、"restart" 或 "set-agent-model"。凭证绑定请在设置页完成。',
		keywords: ["im", "claw", "启用", "重启", "飞书"],
		effect: "write",
		approval: {
			defaultPresentation: "im.set-enabled",
			presentations: [
				{ id: "im.set-enabled", title: "启用/停用 IM 旁路确认", description: "展示 IM 旁路启用状态变更。" },
				{ id: "im.restart", title: "重启 IM 旁路确认", description: "确认重启本地 IM 旁路。" },
				{ id: "im.set-agent-model", title: "设置 IM Agent 模型确认", description: "展示并可编辑 IM Agent 模型。" },
			],
			presentationByOperation: {
				"set-enabled": "im.set-enabled",
				restart: "im.restart",
				"set-agent-model": "im.set-agent-model",
			},
		},
		inputSchema: manageSchema,
		examples: manageExamples,
		assertReady: async ({ input }) => {
			if (input.operation !== "set-agent-model" || input.modelKey === null) return;
			const modelKey = input.modelKey;
			if (!/^[^/]+\/.+$/.test(modelKey)) {
				throwInvalidInput(
					`Refused set-agent-model before user approval: invalid modelKey=${JSON.stringify(modelKey)}. Expected "provider/modelId". Call models.query with {"operation":"list"}.`,
					{ operation: "set-agent-model", idField: "modelKey", id: modelKey },
				);
			}
			try {
				await ctx.official.im.assertModelKeyExists(modelKey);
			} catch (error) {
				throwInvalidInput(error instanceof Error ? error.message : String(error), {
					operation: "set-agent-model",
					modelKey,
				});
			}
		},
		handler: async ({ input }) => {
			if (input.operation === "restart") {
				return { operation: input.operation, ...(await ctx.official.im.restart()) };
			}
			if (input.operation === "set-agent-model") {
				return {
					operation: input.operation,
					...(await ctx.official.im.setAgentModel(input.modelKey, input.reasoningLevel)),
				};
			}
			return {
				operation: input.operation,
				enabled: input.enabled,
				...(await ctx.official.im.setEnabled(input.enabled)),
			};
		},
	});
}
