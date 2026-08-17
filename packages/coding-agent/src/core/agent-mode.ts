/**
 * 工作模式（Work/Coding）单一真源。见 docs/adr/0046。
 *
 * `agent_mode` 是与 scope_use（会话场景）/ requires（能力槽）正交的第三条过滤轴：
 * 工具 / 插件 / MCP / skill 可声明所属模式；缺省/空 = 通用（所有模式可见）。
 * 合法模式在此中心硬编码，插件只能引用、不能自创。
 */

export type AgentMode = "work" | "coding";

export const ALL_AGENT_MODES: readonly AgentMode[] = ["work", "coding"];

/** desktop-app 默认工作模式。CLI/headless 不传模式即不过滤（见 ADR-0046）。 */
export const DEFAULT_AGENT_MODE: AgentMode = "work";

export function isAgentMode(value: unknown): value is AgentMode {
	return value === "work" || value === "coding";
}

/**
 * 某资源（工具/插件/MCP/skill）在给定模式下是否可见。
 * @param declared 资源声明的 agent_mode 列表（缺省/空 = 通用）。
 * @param mode 当前会话模式；`undefined`（CLI/headless）= 不过滤，全部放行。
 */
export function matchesAgentMode(declared: readonly string[] | undefined, mode: string | undefined): boolean {
	if (mode === undefined) return true;
	if (!declared || declared.length === 0) return true;
	return declared.includes(mode);
}
