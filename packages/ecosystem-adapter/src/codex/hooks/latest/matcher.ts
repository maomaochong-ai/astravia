import type { HookRequest } from "../../../hooks/types.js";

export function matchesLatestCodexHook(request: HookRequest, matcher: string | undefined): boolean {
	const inputs = matcherInputs(request);
	if (inputs === undefined || matcher === undefined || matcher.length === 0 || matcher === "*") return true;
	if (isExactMatcher(matcher)) {
		const candidates = matcher.split("|");
		return inputs.some((input) => candidates.includes(input));
	}
	try {
		const regex = new RegExp(matcher);
		return inputs.some((input) => regex.test(input));
	} catch {
		return false;
	}
}

export function validateLatestCodexMatcher(matcher: string): boolean {
	if (matcher.length === 0 || matcher === "*" || isExactMatcher(matcher)) return true;
	try {
		new RegExp(matcher);
		return true;
	} catch {
		return false;
	}
}

export function eventUsesLatestCodexMatcher(eventName: HookRequest["eventName"]): boolean {
	return eventName !== "UserPromptSubmit" && eventName !== "Stop";
}

function matcherInputs(request: HookRequest): readonly string[] | undefined {
	switch (request.eventName) {
		case "SessionStart":
			return [request.source];
		case "SessionEnd":
			// Unsupported on Codex profile; value only exists for HookRequest exhaustiveness.
			return [request.cause];
		case "PreToolUse":
		case "PermissionRequest":
		case "PostToolUse":
		case "PostToolUseFailure":
			return [request.tool.name, ...request.tool.matcherAliases];
		case "PreCompact":
		case "PostCompact":
			return [request.trigger];
		case "SubagentStart":
		case "SubagentStop":
			return [request.agentType];
		case "UserPromptSubmit":
		case "Stop":
			return undefined;
	}
}

function isExactMatcher(matcher: string): boolean {
	return [...matcher].every((character) => /[A-Za-z0-9_|]/.test(character));
}
