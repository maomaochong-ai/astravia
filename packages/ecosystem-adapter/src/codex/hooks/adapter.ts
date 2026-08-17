import { HookDispatcher } from "../../hooks/dispatcher.js";
import { NodeHookCommandExecutor } from "../../hooks/node-command-executor.js";
import type { EcosystemHookAdapter, EcosystemHookEvent } from "../../hooks/runtime.js";
import type { HookConfigLayer, HookDiagnostic, HookRequest, HookRunSummary } from "../../hooks/types.js";
import { discoverCodexHookHandlers } from "./config.js";
import { codexHookProfileFca51f6 } from "./latest/profile.js";
import { mapToolToLatestCodex } from "./latest/tool-mapper.js";

export interface CodexHookAdapterOptions {
	configLayers: readonly HookConfigLayer[];
	onDiagnostic?: (diagnostic: HookDiagnostic) => void;
	onFailedRun?: (summary: HookRunSummary) => void;
}

export async function createCodexHookAdapter(
	options: CodexHookAdapterOptions,
): Promise<EcosystemHookAdapter | undefined> {
	const discovery = await discoverCodexHookHandlers(options.configLayers);
	for (const diagnostic of discovery.diagnostics) options.onDiagnostic?.(diagnostic);
	const byEvent: Record<string, number> = {};
	for (const handler of discovery.handlers) {
		byEvent[handler.eventName] = (byEvent[handler.eventName] ?? 0) + 1;
	}
	const sources = options.configLayers.flatMap((layer) =>
		(layer.sources ?? [{ path: `${layer.directory}/hooks.json` }]).map((source) => source.path),
	);
	console.info("[ecosystem-hooks] codex handlers loaded", {
		profile: codexHookProfileFca51f6.id,
		total: discovery.handlers.length,
		byEvent,
		sources,
		diagnostics: discovery.diagnostics.length,
	});
	const dispatcher = new HookDispatcher({
		profile: codexHookProfileFca51f6,
		handlers: discovery.handlers,
		executor: new NodeHookCommandExecutor(),
		observer: { onRunCompleted: options.onFailedRun },
	});

	return {
		id: codexHookProfileFca51f6.id,
		// SessionEnd / PostToolUseFailure are Claude-only in this release; Codex profile stays at 10 events.
		supports: (event) => event.eventName !== "SessionEnd" && event.eventName !== "PostToolUseFailure",
		dispatch: (event, signal) => dispatcher.dispatch(toLatestCodexRequest(event), signal),
	};
}

function toLatestCodexRequest(event: EcosystemHookEvent): HookRequest {
	const common = {
		sessionId: event.sessionId,
		cwd: event.cwd,
		transcriptPath: event.transcriptPath,
		model: event.model,
		permissionMode: event.permissionMode,
	};
	switch (event.eventName) {
		case "SessionStart":
			return { ...common, eventName: event.eventName, source: event.source };
		case "SessionEnd":
		case "PostToolUseFailure":
			throw new Error(`Codex profile does not support ${event.eventName}`);
		case "UserPromptSubmit":
			return {
				...common,
				eventName: event.eventName,
				turnId: event.turnId,
				prompt: event.prompt,
				subagent: event.subagent,
			};
		case "PreToolUse":
			return {
				...common,
				eventName: event.eventName,
				turnId: event.turnId,
				tool: mapToolToLatestCodex(event.tool),
				toolUseId: event.toolUseId,
				toolInput: event.toolInput,
				subagent: event.subagent,
			};
		case "PermissionRequest":
			return {
				...common,
				eventName: event.eventName,
				turnId: event.turnId,
				tool: mapToolToLatestCodex(event.tool),
				toolInput: event.toolInput,
				runIdSuffix: event.runIdSuffix,
				subagent: event.subagent,
			};
		case "PostToolUse":
			return {
				...common,
				eventName: event.eventName,
				turnId: event.turnId,
				tool: mapToolToLatestCodex(event.tool),
				toolUseId: event.toolUseId,
				toolInput: event.toolInput,
				toolResponse: event.toolResponse,
				subagent: event.subagent,
			};
		case "PreCompact":
		case "PostCompact":
			return {
				...common,
				eventName: event.eventName,
				turnId: event.turnId,
				trigger: event.trigger,
				subagent: event.subagent,
			};
		case "SubagentStart":
			return {
				...common,
				eventName: event.eventName,
				turnId: event.turnId,
				agentId: event.agentId,
				agentType: event.agentType,
			};
		case "SubagentStop":
			return {
				...common,
				eventName: event.eventName,
				turnId: event.turnId,
				agentId: event.agentId,
				agentType: event.agentType,
				agentTranscriptPath: event.agentTranscriptPath,
				stopHookActive: event.stopHookActive,
				lastAssistantMessage: event.lastAssistantMessage,
			};
		case "Stop":
			return {
				...common,
				eventName: event.eventName,
				turnId: event.turnId,
				stopHookActive: event.stopHookActive,
				lastAssistantMessage: event.lastAssistantMessage,
			};
	}
}
