import type { Api } from "./types.js";

/**
 * Per-api-type reasoning-level preset. This is the "new model prefill + empty-list
 * fallback" source described in the reasoning-level design: it is a PRESET, not a
 * constraint — a model may override with its own `reasoningLevels`. When a model has
 * no explicit levels, consumers fall back to the preset for its api type.
 *
 * `levels` are the raw effort values passed through to the provider; `default` is the
 * level used when the user has not chosen one for the model.
 */
export interface ReasoningPreset {
	levels: string[];
	default: string;
}

const EFFORT_STANDARD: ReasoningPreset = { levels: ["minimal", "low", "medium", "high"], default: "medium" };
const EFFORT_LMH: ReasoningPreset = { levels: ["low", "medium", "high"], default: "medium" };
const EFFORT_GLM: ReasoningPreset = { levels: ["none", "minimal", "low", "medium", "high", "max"], default: "high" };

const PRESETS: Partial<Record<Api, ReasoningPreset>> = {
	"openai-completions": EFFORT_STANDARD,
	"openai-responses": EFFORT_STANDARD,
	"azure-openai-responses": EFFORT_STANDARD,
	"openai-codex-responses": EFFORT_STANDARD,
	"qwen-openai-completions": EFFORT_LMH,
	"zai-openai-completions": EFFORT_GLM,
	"zhipu-openai-completions": EFFORT_GLM,
	"nvidia-openai-responses": EFFORT_LMH,
	"openai-completions-deepseek": { levels: ["high", "max"], default: "high" },
	"anthropic-messages": EFFORT_LMH,
	"bedrock-converse-stream": EFFORT_LMH,
	"google-generative-ai": EFFORT_LMH,
	"google-gemini-cli": EFFORT_LMH,
	"google-vertex": EFFORT_LMH,
};

/** Resolve the built-in reasoning preset for an api type, or undefined if none. */
export function getReasoningPreset(api: string): ReasoningPreset | undefined {
	return PRESETS[api as Api];
}
