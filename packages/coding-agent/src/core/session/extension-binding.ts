/**
 * Extension runtime core binding.
 *
 * Extracted from RuntimeManager. `bindExtensionCore` wires a freshly-created
 * ExtensionRunner back to the session facade (the `host`) and shared context for
 * the broad set of session controls extensions can invoke (send messages, switch
 * model, compact, list commands, …). Kept here to keep RuntimeManager focused on
 * tool assembly + MCP.
 */

import type { AgentSession } from "../agent-session.js";
import type { ExtensionRunner, ShutdownHandler, SlashCommandInfo } from "../extensions/index.js";
import type { ResourceLoader } from "../resource-loader.js";
import { BUILTIN_SLASH_COMMANDS, type SlashCommandLocation } from "../slash-commands.js";
import type { SessionContext } from "./session-context.js";

export interface BindExtensionCoreDeps {
	ctx: SessionContext;
	host: AgentSession;
	resourceLoader: ResourceLoader;
	getActiveTools: () => string[];
	getAllTools: () => ReturnType<AgentSession["getAllTools"]>;
	setActiveTools: (toolNames: string[]) => void;
	getShutdownHandler: () => ShutdownHandler | undefined;
}

/** Wire the extension runner's core capabilities to the session facade + context. */
export function bindExtensionCore(runner: ExtensionRunner, deps: BindExtensionCoreDeps): void {
	const { ctx, host, resourceLoader } = deps;

	const normalizeLocation = (source: string): SlashCommandLocation | undefined => {
		if (source === "user" || source === "project" || source === "path") {
			return source;
		}
		return undefined;
	};

	const reservedBuiltins = new Set(BUILTIN_SLASH_COMMANDS.map((command) => command.name));

	const getCommands = (): SlashCommandInfo[] => {
		const extensionCommands: SlashCommandInfo[] = runner
			.getRegisteredCommandsWithPaths()
			.filter(({ command }) => !reservedBuiltins.has(command.name))
			.map(({ command, extensionPath }) => ({
				name: command.name,
				description: command.description,
				source: "extension",
				path: extensionPath,
			}));

		const templates: SlashCommandInfo[] = resourceLoader.getPrompts().prompts.map((template) => ({
			name: template.name,
			description: template.description,
			source: "prompt",
			location: normalizeLocation(template.source),
			path: template.filePath,
		}));

		const skills: SlashCommandInfo[] = resourceLoader.getSkills().skills.map((skill) => ({
			name: `skill:${skill.name}`,
			description: skill.description,
			source: "skill",
			location: normalizeLocation(skill.source),
			path: skill.filePath,
		}));

		return [...extensionCommands, ...templates, ...skills];
	};

	runner.bindCore(
		{
			sendMessage: (message, options) => {
				host.sendCustomMessage(message, options).catch((err) => {
					runner.emitError({
						extensionPath: "<runtime>",
						event: "send_message",
						error: err instanceof Error ? err.message : String(err),
					});
				});
			},
			sendUserMessage: (content, options) => {
				host.sendUserMessage(content, options).catch((err) => {
					runner.emitError({
						extensionPath: "<runtime>",
						event: "send_user_message",
						error: err instanceof Error ? err.message : String(err),
					});
				});
			},
			appendEntry: (customType, data) => {
				ctx.sessionManager.appendCustomEntry(customType, data);
			},
			setSessionName: (name) => {
				ctx.sessionManager.appendSessionInfo(name);
			},
			getSessionName: () => {
				return ctx.sessionManager.getSessionName();
			},
			setLabel: (entryId, label) => {
				ctx.sessionManager.appendLabelChange(entryId, label);
			},
			getActiveTools: () => deps.getActiveTools(),
			getAllTools: () => deps.getAllTools(),
			setActiveTools: (toolNames) => deps.setActiveTools(toolNames),
			getCommands,
			setModel: async (model) => {
				const key = await ctx.modelRegistry.getApiKey(model);
				if (!key) return false;
				await host.setModel(model);
				return true;
			},
			getThinkingLevel: () => host.thinkingLevel,
			setThinkingLevel: (level) => host.setThinkingLevel(level),
		},
		{
			getModel: () => ctx.model,
			isIdle: () => !ctx.agent.state.isStreaming,
			abort: () => ctx.abort(),
			hasPendingMessages: () => host.pendingMessageCount > 0,
			shutdown: () => {
				deps.getShutdownHandler()?.();
			},
			getContextUsage: () => host.getContextUsage(),
			compact: (options) => {
				void (async () => {
					try {
						const result = await host.compact(options?.customInstructions);
						options?.onComplete?.(result);
					} catch (error) {
						const err = error instanceof Error ? error : new Error(String(error));
						options?.onError?.(err);
					}
				})();
			},
			getSystemPrompt: () => ctx.agent.state.systemPrompt,
		},
	);
}
