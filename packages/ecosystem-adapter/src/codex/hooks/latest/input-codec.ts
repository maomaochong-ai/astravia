import type { HookRequest, SubagentHookContext } from "../../../hooks/types.js";

export function encodeLatestCodexHookInput(request: HookRequest): string {
	const lifecycle = {
		session_id: request.sessionId,
		transcript_path: request.transcriptPath,
		cwd: request.cwd,
		hook_event_name: request.eventName,
		model: request.model,
	};
	const permission = { ...lifecycle, permission_mode: request.permissionMode };

	switch (request.eventName) {
		case "SessionStart":
			return JSON.stringify({ ...permission, source: request.source });
		case "SessionEnd":
		case "PostToolUseFailure":
			throw new Error(`Codex profile does not encode ${request.eventName}`);
		case "UserPromptSubmit":
			return JSON.stringify({
				...permission,
				turn_id: request.turnId,
				...subagentFields(request.subagent),
				prompt: request.prompt,
			});
		case "PreToolUse":
			return JSON.stringify({
				...permission,
				turn_id: request.turnId,
				...subagentFields(request.subagent),
				tool_name: request.tool.name,
				tool_input: request.toolInput,
				tool_use_id: request.toolUseId,
			});
		case "PermissionRequest":
			return JSON.stringify({
				...permission,
				turn_id: request.turnId,
				...subagentFields(request.subagent),
				tool_name: request.tool.name,
				tool_input: request.toolInput,
			});
		case "PostToolUse":
			return JSON.stringify({
				...permission,
				turn_id: request.turnId,
				...subagentFields(request.subagent),
				tool_name: request.tool.name,
				tool_input: request.toolInput,
				tool_response: request.toolResponse,
				tool_use_id: request.toolUseId,
			});
		case "PreCompact":
		case "PostCompact":
			return JSON.stringify({
				...lifecycle,
				turn_id: request.turnId,
				...subagentFields(request.subagent),
				trigger: request.trigger,
			});
		case "SubagentStart":
			return JSON.stringify({
				...permission,
				turn_id: request.turnId,
				agent_id: request.agentId,
				agent_type: request.agentType,
			});
		case "SubagentStop":
			return JSON.stringify({
				...permission,
				turn_id: request.turnId,
				agent_id: request.agentId,
				agent_type: request.agentType,
				agent_transcript_path: request.agentTranscriptPath,
				stop_hook_active: request.stopHookActive,
				last_assistant_message: request.lastAssistantMessage,
			});
		case "Stop":
			return JSON.stringify({
				...permission,
				turn_id: request.turnId,
				stop_hook_active: request.stopHookActive,
				last_assistant_message: request.lastAssistantMessage,
			});
	}
}

function subagentFields(context: SubagentHookContext | undefined): Record<string, string> {
	return context ? { agent_id: context.agentId, agent_type: context.agentType } : {};
}
