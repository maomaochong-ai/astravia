import type { HookCompatibilityProfile } from "../../hooks/types.js";
import { aggregateClaudeHookOutcomes, interpretClaudeHookResult } from "./event-semantics.js";
import { encodeClaudeHookInput } from "./input-codec.js";
import { matchesClaudeHook } from "./matcher.js";

/** Versioned Claude Code Hook wire profile. Pin to a documented Claude Code baseline. */
export const CLAUDE_CODE_HOOK_PROFILE_ID = "claude-code-hooks/2.1.211";

export const claudeCodeHookProfile: HookCompatibilityProfile = {
	id: CLAUDE_CODE_HOOK_PROFILE_ID,
	encodeInput: encodeClaudeHookInput,
	interpretResult: interpretClaudeHookResult,
	aggregate: aggregateClaudeHookOutcomes,
	matches: matchesClaudeHook,
};
