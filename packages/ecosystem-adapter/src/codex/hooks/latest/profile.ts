import type { HookCompatibilityProfile } from "../../../hooks/types.js";
import { aggregateLatestCodexHookOutcomes, interpretLatestCodexHookResult } from "./event-semantics.js";
import { encodeLatestCodexHookInput } from "./input-codec.js";
import { matchesLatestCodexHook } from "./matcher.js";

export const LATEST_CODEX_HOOK_PROFILE_ID = "codex-hooks/fca51f6";

export const codexHookProfileFca51f6: HookCompatibilityProfile = {
	id: LATEST_CODEX_HOOK_PROFILE_ID,
	encodeInput: encodeLatestCodexHookInput,
	interpretResult: interpretLatestCodexHookResult,
	aggregate: aggregateLatestCodexHookOutcomes,
	matches: matchesLatestCodexHook,
};
