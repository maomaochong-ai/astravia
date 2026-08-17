/**
 * System prompt + personalization assembly.
 *
 * Extracted from AgentSession. Pure functions over explicitly-passed session
 * state; the facade keeps thin wrappers and the lazy-rebuild signature logic.
 */

import type { AgentTool } from "@astravia/agent-core";
import { matchesAgentMode } from "../agent-mode.js";
import type { McpManager } from "../mcp/index.js";
import { renderMemoryForPrompt } from "../memory/memory-store.js";
import { getModePrompt } from "../mode-prompt.js";
import { getPersonaPrompt } from "../personas.js";
import type { ResourceLoader } from "../resource-loader.js";
import type { SettingsManager } from "../settings-manager.js";
import {
	type AgentPluginRuntimeConfig,
	type BuildSystemPromptOptions,
	buildSystemPrompt,
	buildSystemPromptDraft,
	type SystemPromptDraft,
} from "../system-prompt.js";
import type { ConversationScenario } from "./tool-scope.js";

/**
 * Build the personalization (persona + custom instructions) append block.
 * Order: persona first, custom instructions second; default persona contributes
 * an empty string. Returns undefined when both are empty.
 */
export function buildPersonalizationBlock(settingsManager: SettingsManager): string | undefined {
	const { personaId, customPrompt } = settingsManager.getPersonalization();
	const parts: string[] = [];
	const personaPrompt = getPersonaPrompt(personaId);
	if (personaPrompt.trim()) parts.push(personaPrompt.trim());
	if (customPrompt.trim()) parts.push(customPrompt.trim());
	return parts.length > 0 ? parts.join("\n\n") : undefined;
}

/** Personalization signature, used for lazy-rebuild change detection. */
export function personalizationSig(settingsManager: SettingsManager): string {
	const { personaId, customPrompt } = settingsManager.getPersonalization();
	return `${personaId} ${customPrompt}`;
}

/** Dependencies required to rebuild the base system prompt. */
export interface SystemPromptDeps {
	toolNames: string[];
	baseToolRegistry: Map<string, AgentTool>;
	resourceLoader: ResourceLoader;
	mcpManager: McpManager | undefined;
	cwd: string;
	settingsManager: SettingsManager;
	memoryMode: boolean;
	memoryFile: string | undefined;
	memorySnapshot: string;
	memoryCharLimit: number;
	/** 当前工作模式（agent_mode 轴）。解析出模式专用 system prompt block。见 ADR-0046。 */
	agentMode?: string;
	agentPlugins?: AgentPluginRuntimeConfig;
	/** 当前对话场景。用于裁剪仅对 UI 渲染有意义的 guideline（cli 场景剔除渲染契约）。 */
	scenario?: ConversationScenario;
	/** MCP 渐进披露模式：true 时提示词列全量 MCP 索引（含未激活）并引导 tool_search 激活。 */
	mcpDeferred?: boolean;
}

function resolveSystemPromptOptions(deps: SystemPromptDeps): BuildSystemPromptOptions {
	const validToolNames = deps.toolNames.filter((name) => deps.baseToolRegistry.has(name));
	const loaderSystemPrompt = deps.resourceLoader.getSystemPrompt();
	const loaderAppendSystemPrompt = deps.resourceLoader.getAppendSystemPrompt();
	const appendSystemPrompt = loaderAppendSystemPrompt.length > 0 ? loaderAppendSystemPrompt.join("\n\n") : undefined;
	// agent_mode 轴：过滤掉当前模式不可见的 skill（未声明 agent_mode 视为通用）。见 ADR-0046。
	const loadedSkills = deps.resourceLoader
		.getSkills()
		.skills.filter((s) => matchesAgentMode(s.agentMode, deps.agentMode));
	const loadedContextFiles = deps.resourceLoader.getAgentsFiles().agentsFiles;

	// Collect MCP tool information for system prompt.
	// deferred 模式下列全量索引（未激活的工具正是需要被模型发现的），否则只列已激活工具。
	const mcpTools =
		deps.mcpManager
			?.getTools()
			.filter((tool) => deps.mcpDeferred || deps.toolNames.includes(tool.name))
			.map((tool) => ({
				name: tool.name,
				description: tool.description || `Tool from MCP server`,
			})) ?? [];

	const memory =
		deps.memoryMode && deps.memoryFile
			? renderMemoryForPrompt(deps.memoryFile, deps.memorySnapshot, deps.memoryCharLimit)
			: undefined;

	const personalization = buildPersonalizationBlock(deps.settingsManager);
	const modePrompt = getModePrompt(deps.agentMode);

	return {
		cwd: deps.cwd,
		skills: loadedSkills,
		contextFiles: loadedContextFiles,
		customPrompt: loaderSystemPrompt,
		appendSystemPrompt,
		selectedTools: validToolNames,
		mcpTools,
		memory,
		personalization,
		modePrompt,
		agentPlugins: deps.agentPlugins,
		scenario: deps.scenario,
		mcpDeferred: deps.mcpDeferred,
	};
}

/** Rebuild the base system prompt from current session state. */
export function rebuildSystemPrompt(deps: SystemPromptDeps): string {
	return buildSystemPrompt(resolveSystemPromptOptions(deps));
}

export function rebuildSystemPromptDraft(deps: SystemPromptDeps): SystemPromptDraft {
	return buildSystemPromptDraft(resolveSystemPromptOptions(deps));
}
