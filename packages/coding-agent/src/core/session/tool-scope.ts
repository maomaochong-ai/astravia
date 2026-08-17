/**
 * 工具按「对话场景」的激活解析（取代旧的 alwaysActive 魔法数组 + 散落 gate）。
 *
 * 每个工具在定义处声明 `scope_use`（允许出现的场景）/ `requires`（需要的会话能力）/
 * `defaultActive`（是否默认激活）。本模块据此 + 当前场景 + 会话能力集，纯函数地算出激活集。
 *
 * 设计要点：
 * - scope_use 只能「减」：它过滤注册表里已有的工具，不能凭空新增宿主未注入的工具。
 * - **fail-closed**：scope_use 缺省/空 = 所有场景都不激活（须显式声明）。外部工具（MCP /
 *   extension / plugin）在并入注册表时由 buildRuntime 显式盖章 scope_use（MCP=全场景）。
 *   find/ls 这类「注册但默认不激活、按需 toggle」的工具用空 scope_use 表达。
 * - requires 缺省 = 无能力要求。能力集由 buildRuntime 据会话配置（知识库开关 / 后台任务 /
 *   ask 能力等）计算后传入。
 */

import type { AgentTool } from "@astravia/agent-core";
import type { TSchema } from "@sinclair/typebox";
import { matchesAgentMode } from "../agent-mode.js";

/** 对话场景 slug。隔离的唯一轴。 */
export type ConversationScenario =
	| "im-claw" // Claw IM 对话（im-gateway sidecar 起的子进程）
	| "conversation" // 普通对话（~/.astravia/conversation）
	| "project" // 普通项目中对话（用户自建项目）
	| "batch" // 批量任务对话
	| "automation" // 自动化任务对话（scheduler 定时触发）
	| "kb-processing" // 知识库加工对话
	| "cli"; // 裸 CLI / SDK 消费者（fallback，≈全开）

export const ALL_SCENARIOS: readonly ConversationScenario[] = [
	"im-claw",
	"conversation",
	"project",
	"batch",
	"automation",
	"kb-processing",
	"cli",
];

/** 无 scenario 传入时的默认场景（CLI / SDK 独立调用）。 */
export const DEFAULT_SCENARIO: ConversationScenario = "cli";

/**
 * coding-agent 内置工具用的 AgentTool 别名：把第三个泛型钉成本包的 `ConversationScenario`。
 * 工具用 `CodingAgentTool<typeof xSchema>` 作返回类型即可在声明 `scope_use` 时拿到场景补全/
 * 防拼写，而 agent-core 仍保持场景词汇无关（默认 `string`）。
 */
export type CodingAgentTool<TParameters extends TSchema = TSchema, TDetails = any> = AgentTool<
	TParameters,
	TDetails,
	ConversationScenario
>;

/** 会话能力 slug。requires 与之取交集。 */
export type ToolCapability =
	| "knowledge" // 知识库未被 ASTRAVIA_KNOWLEDGE_DISABLED 关闭
	| "bg-tasks" // 启用了后台 bash 任务
	| "host:ask"; // 宿主提供了 ask_user_question 能力

/** 功能域分类（仅供分组/UI/审计，不影响激活）。 */
export type ToolCategory =
	| "core"
	| "doc"
	| "kb-write"
	| "kb-read"
	| "agent-control"
	| "media"
	| "im"
	| "memory"
	| "external";

/**
 * 解析某场景下应激活的工具名集合。
 * @param scenario 当前对话场景。
 * @param tools 注册表里全部可用工具（含 MCP / plugin / extension）。
 * @param capabilities 当前会话具备的能力集。
 * @param mode 当前工作模式（agent_mode 正交轴）；`undefined`（CLI/headless）= 不过滤。见 ADR-0046。
 */
export function resolveActiveToolNames(
	scenario: ConversationScenario,
	tools: AgentTool[],
	capabilities: ReadonlySet<string>,
	mode?: string,
): string[] {
	const active: string[] = [];
	for (const tool of tools) {
		// fail-closed：未声明 scope_use 或不含当前场景 → 不激活。
		if (!tool.scope_use || !tool.scope_use.includes(scenario)) continue;
		if (tool.requires && !tool.requires.every((c) => capabilities.has(c))) continue;
		// agent_mode 正交轴：未传 mode 不过滤；工具未声明 agent_mode 视为通用。
		if (!matchesAgentMode(tool.agent_mode, mode)) continue;
		active.push(tool.name);
	}
	return active;
}
