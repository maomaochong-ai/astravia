import type { PluginAppActionExample, PluginContext, PluginJsonSchema } from "@astravia-org/plugin-sdk";
import { throwEntityNotFound, throwInvalidInput } from "../action-errors";

type SkillsQueryInput =
	| { operation: "help" }
	| { operation: "list"; cwd?: string }
	| { operation: "manifest" };
type SkillsManageInput =
	| { operation: "set-enabled"; name: string; enabled: boolean }
	| { operation: "uninstall"; name: string; type?: "skill" };

const querySchema: PluginJsonSchema = {
	type: "object",
	oneOf: [
		{ properties: { operation: { const: "help" } }, required: ["operation"], additionalProperties: false },
		{
			properties: {
				operation: { const: "list" },
				cwd: { type: "string", minLength: 1 },
			},
			required: ["operation"],
			additionalProperties: false,
		},
		{ properties: { operation: { const: "manifest" } }, required: ["operation"], additionalProperties: false },
	],
};

const manageSchema: PluginJsonSchema = {
	type: "object",
	oneOf: [
		{
			properties: {
				operation: { const: "set-enabled" },
				name: { type: "string", minLength: 1 },
				enabled: { type: "boolean" },
			},
			required: ["operation", "name", "enabled"],
			additionalProperties: false,
		},
		{
			properties: {
				operation: { const: "uninstall" },
				name: { type: "string", minLength: 1 },
				type: { enum: ["skill"] },
			},
			required: ["operation", "name"],
			additionalProperties: false,
		},
	],
};

const queryExamples: PluginAppActionExample<SkillsQueryInput>[] = [
	{ description: "列出技能", input: { operation: "list" } },
	{ description: "查看安装清单", input: { operation: "manifest" } },
];
const manageExamples: PluginAppActionExample<SkillsManageInput>[] = [
	{ description: "停用技能", input: { operation: "set-enabled", name: "my-skill", enabled: false } },
	{ description: "卸载技能", input: { operation: "uninstall", name: "my-skill" } },
];

export function registerSkillsActions(ctx: PluginContext): void {
	ctx.appActions.register<SkillsQueryInput>({
		id: "skills.query",
		publicId: "skills.query",
		title: "查询技能",
		summary: "列出可见技能/场景，或读取本地安装清单。",
		description:
			'对象参数；operation 为 "help"、"list" 或 "manifest"。list 可传 cwd 以包含项目级 skills。市场安装需 GUI，本 Action 不提供 install。',
		keywords: ["技能", "skill", "技能广场", "插件技能", "manifest"],
		effect: "read",
		inputSchema: querySchema,
		examples: queryExamples,
		handler: async ({ input }) => {
			if (input.operation === "help") {
				return {
					guidance:
						"从市场安装请引导用户打开技能广场或使用 GUI；Action 支持 list/manifest 与启用停用/卸载。",
					actions: [
						{ id: "skills.query", inputSchema: querySchema, examples: queryExamples },
						{ id: "skills.manage", inputSchema: manageSchema, examples: manageExamples },
					],
				};
			}
			if (input.operation === "manifest") return ctx.official.skills.getManifest();
			return ctx.official.skills.list(input.cwd);
		},
	});
	ctx.appActions.register<SkillsManageInput>({
		id: "skills.manage",
		publicId: "skills.manage",
		title: "管理技能",
		summary: "启用、停用或卸载已安装的技能/场景。",
		description: '对象参数；operation 为 "set-enabled" 或 "uninstall"。仅对 manifest 中已安装条目有效。',
		keywords: ["技能", "skill", "启用", "停用", "卸载", "uninstall"],
		effect: "write",
		approval: {
			defaultPresentation: "skills.set-enabled",
			presentations: [
				{ id: "skills.set-enabled", title: "启用/停用技能确认", description: "展示技能启用状态变更。" },
				{ id: "skills.uninstall", title: "卸载技能确认", description: "展示待卸载技能。" },
			],
			presentationByOperation: {
				"set-enabled": "skills.set-enabled",
				uninstall: "skills.uninstall",
			},
		},
		inputSchema: manageSchema,
		examples: manageExamples,
		assertReady: async ({ input }) => {
			const manifest = await ctx.official.skills.getManifest();
			const entry = manifest[input.name];
			if (!entry) {
				throwEntityNotFound({
					operation: input.operation,
					entity: "installed skill",
					idField: "name",
					id: input.name,
					queryAction: "skills.query",
					queryExample: { operation: "manifest" },
					resultIdPath: "object keys of the manifest / list items[].name",
					availableIds: Object.keys(manifest),
					extra: 'You may also call skills.query with {"operation":"list"}.',
				});
			}
			if (input.operation === "uninstall" && input.type) {
				const actualType = "skill";
				if (actualType !== input.type) {
					throwInvalidInput(
						`Refused uninstall before user approval: name=${JSON.stringify(input.name)} has type=${JSON.stringify(actualType)}, but you passed type=${JSON.stringify(input.type)}.`,
						{ operation: input.operation, name: input.name, type: actualType, requestedType: input.type },
					);
				}
			}
		},
		handler: async ({ input }) => {
			if (input.operation === "set-enabled") {
				return {
					operation: input.operation,
					...(await ctx.official.skills.setEnabled(input.name, input.enabled)),
				};
			}
			await ctx.official.skills.uninstall(input.name, input.type);
			return { operation: input.operation, name: input.name, type: input.type ?? null };
		},
	});
}
