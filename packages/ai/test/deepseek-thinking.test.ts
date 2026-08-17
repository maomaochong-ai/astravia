import { describe, expect, it, vi } from "vitest";
import { streamSimple } from "../src/stream.js";
import type { Model, SimpleStreamOptions } from "../src/types.js";

const mockState = vi.hoisted(() => ({ lastParams: undefined as unknown }));

vi.mock("openai", () => {
	class FakeOpenAI {
		chat = {
			completions: {
				create: async (params: unknown) => {
					mockState.lastParams = params;
					return {
						async *[Symbol.asyncIterator]() {
							yield {
								choices: [{ delta: {}, finish_reason: "stop" }],
								usage: {
									prompt_tokens: 1,
									completion_tokens: 1,
									prompt_tokens_details: { cached_tokens: 0 },
									completion_tokens_details: { reasoning_tokens: 0 },
								},
							};
						},
					};
				},
			},
		};
	}

	return { default: FakeOpenAI };
});

function deepseekModel(): Model<"openai-completions-deepseek"> {
	return {
		id: "deepseek-v4-flash",
		name: "deepseek-v4-flash",
		api: "openai-completions-deepseek",
		provider: "deepseek",
		baseUrl: "https://api.deepseek.com",
		reasoning: true,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 1_000_000,
		maxTokens: 8192,
	};
}

async function capture(model: Model<"openai-completions-deepseek">, reasoning?: string): Promise<any> {
	let payload: unknown;
	await streamSimple(model, { messages: [{ role: "user", content: "hi", timestamp: Date.now() }] }, {
		apiKey: "test",
		reasoning,
		onPayload: (params: unknown) => {
			payload = params;
		},
	} as SimpleStreamOptions).result();
	return (payload ?? mockState.lastParams) as any;
}

function zaiModel(api: "zai-openai-completions" | "zhipu-openai-completions"): Model<typeof api> {
	return {
		id: "glm-4.6",
		name: "glm-4.6",
		api,
		provider: api === "zhipu-openai-completions" ? "zhipu" : "zai",
		baseUrl:
			api === "zhipu-openai-completions" ? "https://open.bigmodel.cn/api/paas/v4" : "https://api.z.ai/api/paas/v4",
		reasoning: true,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 1_000_000,
		maxTokens: 8192,
	};
}

async function captureZai(
	model: Model<"zai-openai-completions" | "zhipu-openai-completions">,
	reasoning?: string,
): Promise<any> {
	let payload: unknown;
	await streamSimple(model, { messages: [{ role: "user", content: "hi", timestamp: Date.now() }] }, {
		apiKey: "test",
		reasoning,
		onPayload: (params: unknown) => {
			payload = params;
		},
	} as SimpleStreamOptions).result();
	return (payload ?? mockState.lastParams) as any;
}

describe("z.ai / zhipu openai-completions thinking", () => {
	it("enables thinking and passes GLM effort verbatim", async () => {
		const params = await captureZai(zaiModel("zai-openai-completions"), "max");
		expect(params.thinking).toEqual({ type: "enabled" });
		expect(params.reasoning_effort).toBe("max");
	});

	it("supports zhipu with the same GLM thinking format", async () => {
		const params = await captureZai(zaiModel("zhipu-openai-completions"), "minimal");
		expect(params.thinking).toEqual({ type: "enabled" });
		expect(params.reasoning_effort).toBe("minimal");
	});

	it("explicitly disables thinking and omits effort when reasoning is off", async () => {
		const params = await captureZai(zaiModel("zai-openai-completions"), undefined);
		expect(params.thinking).toEqual({ type: "disabled" });
		expect(params.reasoning_effort).toBeUndefined();
	});
});

describe("openai-completions-deepseek thinking", () => {
	it("enables thinking with reasoning_effort passthrough", async () => {
		const params = await capture(deepseekModel(), "high");
		expect(params.thinking).toEqual({ type: "enabled", reasoning_effort: "high" });
		// DeepSeek uses the thinking object, not the top-level reasoning_effort field.
		expect(params.reasoning_effort).toBeUndefined();
	});

	it("passes the configured effort verbatim (no clamping)", async () => {
		const params = await capture(deepseekModel(), "max");
		expect(params.thinking).toEqual({ type: "enabled", reasoning_effort: "max" });
	});

	it("disables thinking when no reasoning is requested", async () => {
		const params = await capture(deepseekModel(), undefined);
		expect(params.thinking).toEqual({ type: "disabled" });
	});
});

describe("openai-completions reasoning passthrough", () => {
	function openaiModel(): Model<"openai-completions"> {
		return {
			id: "gpt-5.2",
			name: "gpt-5.2",
			api: "openai-completions",
			provider: "openai",
			baseUrl: "https://api.openai.com/v1",
			reasoning: true,
			input: ["text"],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 400_000,
			maxTokens: 8192,
		};
	}

	async function captureOpenAI(model: Model<"openai-completions">, reasoning?: string): Promise<any> {
		let payload: unknown;
		await streamSimple(model, { messages: [{ role: "user", content: "hi", timestamp: Date.now() }] }, {
			apiKey: "test",
			reasoning,
			onPayload: (params: unknown) => {
				payload = params;
			},
		} as SimpleStreamOptions).result();
		return (payload ?? mockState.lastParams) as any;
	}

	it("passes xhigh through unchanged on official OpenAI endpoints (no clamp)", async () => {
		const params = await captureOpenAI(openaiModel(), "xhigh");
		expect(params.reasoning_effort).toBe("xhigh");
	});

	it("keeps minimal on official OpenAI endpoints", async () => {
		const params = await captureOpenAI(openaiModel(), "minimal");
		expect(params.reasoning_effort).toBe("minimal");
	});

	it("sends reasoning_effort:none on off for official OpenAI (gpt-5 disable)", async () => {
		const params = await captureOpenAI(openaiModel(), undefined);
		expect(params.reasoning_effort).toBe("none");
	});

	function genericDeepseekModel(): Model<"openai-completions"> {
		return {
			id: "deepseek-reasoner",
			name: "deepseek-reasoner",
			api: "openai-completions",
			provider: "deepseek",
			baseUrl: "https://api.deepseek.com/v1",
			reasoning: true,
			input: ["text"],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 128_000,
			maxTokens: 8192,
		};
	}

	it("omits reasoning_effort on off for non-OpenAI reasoning endpoints (none unsupported)", async () => {
		const params = await captureOpenAI(genericDeepseekModel(), undefined);
		// DeepSeek / gateways / vLLM reject or ignore "none"; off must omit the field
		// so the backend falls back to its non-thinking default.
		expect(params.reasoning_effort).toBeUndefined();
	});
});
