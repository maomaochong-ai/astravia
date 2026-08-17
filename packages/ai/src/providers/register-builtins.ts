import { clearApiProviders, registerApiProvider } from "../api-registry.js";
import { streamBedrock, streamSimpleBedrock } from "./amazon-bedrock.js";
import { streamAnthropic, streamSimpleAnthropic } from "./anthropic.js";
import { streamAzureOpenAIResponses, streamSimpleAzureOpenAIResponses } from "./azure-openai-responses.js";
import { streamDeepSeek, streamSimpleDeepSeek } from "./deepseek.js";
import { streamGoogle, streamSimpleGoogle } from "./google.js";
import { streamGoogleGeminiCli, streamSimpleGoogleGeminiCli } from "./google-gemini-cli.js";
import { streamGoogleVertex, streamSimpleGoogleVertex } from "./google-vertex.js";
import { streamNvidia, streamSimpleNvidia } from "./nvidia.js";
import { streamOpenAICodexResponses, streamSimpleOpenAICodexResponses } from "./openai-codex-responses.js";
import { streamOpenAICompletions, streamSimpleOpenAICompletions } from "./openai-completions.js";
import { streamOpenAIResponses, streamSimpleOpenAIResponses } from "./openai-responses.js";
import { streamQwen, streamSimpleQwen } from "./qwen.js";
import { streamSimpleZai, streamZai } from "./zai.js";
import { streamSimpleZhipu, streamZhipu } from "./zhipu.js";

export function registerBuiltInApiProviders(): void {
	registerApiProvider({
		api: "anthropic-messages",
		stream: streamAnthropic,
		streamSimple: streamSimpleAnthropic,
	});

	registerApiProvider({
		api: "openai-completions",
		stream: streamOpenAICompletions,
		streamSimple: streamSimpleOpenAICompletions,
	});

	registerApiProvider({
		api: "openai-responses",
		stream: streamOpenAIResponses,
		streamSimple: streamSimpleOpenAIResponses,
	});

	registerApiProvider({
		api: "azure-openai-responses",
		stream: streamAzureOpenAIResponses,
		streamSimple: streamSimpleAzureOpenAIResponses,
	});

	registerApiProvider({
		api: "openai-codex-responses",
		stream: streamOpenAICodexResponses,
		streamSimple: streamSimpleOpenAICodexResponses,
	});

	registerApiProvider({
		api: "google-generative-ai",
		stream: streamGoogle,
		streamSimple: streamSimpleGoogle,
	});

	registerApiProvider({
		api: "google-gemini-cli",
		stream: streamGoogleGeminiCli,
		streamSimple: streamSimpleGoogleGeminiCli,
	});

	registerApiProvider({
		api: "google-vertex",
		stream: streamGoogleVertex,
		streamSimple: streamSimpleGoogleVertex,
	});

	registerApiProvider({
		api: "nvidia-openai-responses",
		stream: streamNvidia,
		streamSimple: streamSimpleNvidia,
	});

	registerApiProvider({
		api: "qwen-openai-completions",
		stream: streamQwen,
		streamSimple: streamSimpleQwen,
	});

	registerApiProvider({
		api: "openai-completions-deepseek",
		stream: streamDeepSeek,
		streamSimple: streamSimpleDeepSeek,
	});

	registerApiProvider({
		api: "zai-openai-completions",
		stream: streamZai,
		streamSimple: streamSimpleZai,
	});

	registerApiProvider({
		api: "zhipu-openai-completions",
		stream: streamZhipu,
		streamSimple: streamSimpleZhipu,
	});

	registerApiProvider({
		api: "bedrock-converse-stream",
		stream: streamBedrock,
		streamSimple: streamSimpleBedrock,
	});
}

export function resetApiProviders(): void {
	clearApiProviders();
	registerBuiltInApiProviders();
}

registerBuiltInApiProviders();
