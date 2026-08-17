import {
	type Api,
	completeSimple,
	getReasoningPreset,
	type Model,
	type TextContent,
	type Tool,
	type ToolCall,
	Type,
} from "@astravia/ai";
import type { ModelRegistry } from "@astravia/coding-agent";

/** 周边任务最多尝试几个模型（会话模型优先，再补可用模型）。 */
const PERIPHERAL_MAX_ATTEMPTS = 3;
/** 失败模型进程内冷却时长，避免连打坏模型。 */
const PERIPHERAL_COOLDOWN_MS = 2 * 60 * 1000;
/** key = "provider/modelId" → cooldown until epoch ms */
const peripheralCooldownUntil = new Map<string, number>();

export type PeripheralCandidate = {
	model: Model<Api>;
	apiKey: string;
	reasoning: string | undefined;
	key: string;
};

export type PeripheralModelSource = {
	modelRegistry: ModelRegistry;
	/** 当前会话模型；优先作为候选队首。 */
	sessionModel: Model<Api> | undefined;
};

function peripheralModelKey(model: Model<Api>): string {
	return `${model.provider}/${model.id}`;
}

function isPeripheralCoolingDown(key: string): boolean {
	const until = peripheralCooldownUntil.get(key);
	if (until === undefined) return false;
	if (Date.now() >= until) {
		peripheralCooldownUntil.delete(key);
		return false;
	}
	return true;
}

function markPeripheralCooldown(key: string, ms = PERIPHERAL_COOLDOWN_MS): void {
	peripheralCooldownUntil.set(key, Date.now() + ms);
}

/**
 * 解析周边任务(auto-title / 输入预测)的候选模型列表。
 * 优先当前会话模型，再从可用模型补足；跳过冷却中的与无 apiKey 的。
 */
export async function resolvePeripheralCandidates(source: PeripheralModelSource): Promise<PeripheralCandidate[]> {
	const registry = source.modelRegistry;
	registry.refresh();

	const candidates: PeripheralCandidate[] = [];
	const seen = new Set<string>();

	const tryPush = async (model: Model<Api> | undefined) => {
		if (!model || candidates.length >= PERIPHERAL_MAX_ATTEMPTS) return;
		const key = peripheralModelKey(model);
		if (seen.has(key) || isPeripheralCoolingDown(key)) return;
		const apiKey = await registry.getApiKey(model);
		if (!apiKey) return;
		seen.add(key);
		// 周边任务用各 API 最轻 reasoning 档，避免短答案被吞进 thinking 通道。
		const level = getReasoningPreset(model.api)?.levels[0] || "minimal";
		const reasoning = level === "off" ? undefined : level;
		candidates.push({ model, apiKey, reasoning, key });
	};

	await tryPush(source.sessionModel);
	for (const model of registry.getAvailable()) {
		if (candidates.length >= PERIPHERAL_MAX_ATTEMPTS) break;
		await tryPush(model);
	}
	return candidates;
}

/**
 * 按候选列表依次调用，失败则冷却该模型并轮转下一个。
 * run 返回 null 表示本候选失败（可轮转）；返回值则成功结束。
 */
export async function runWithPeripheralFailover<T>(
	source: PeripheralModelSource,
	label: string,
	run: (candidate: PeripheralCandidate) => Promise<T | null>,
): Promise<T | null> {
	const candidates = await resolvePeripheralCandidates(source);
	if (candidates.length === 0) {
		console.warn(`[${label}] skipped: no available model with credentials`);
		return null;
	}
	for (const candidate of candidates) {
		console.log(`[${label}] trying model=${candidate.key}`);
		try {
			const value = await run(candidate);
			if (value !== null) return value;
			console.warn(`[${label}] model=${candidate.key} produced no usable result; rotating`);
			markPeripheralCooldown(candidate.key);
		} catch (err) {
			console.warn(`[${label}] model=${candidate.key} failed:`, err);
			markPeripheralCooldown(candidate.key);
		}
	}
	console.warn(`[${label}] all ${candidates.length} candidate(s) exhausted`);
	return null;
}

/** 输入预测的结构化输出工具：JSON schema 强约束 suggestions 为字符串数组。 */
const SUGGESTIONS_TOOL: Tool = {
	name: "provide_prompt_suggestions",
	description: "提交预测出的、用户接下来最可能亲自发送给助手的下一句话（0-3 条，用户第一人称口吻）。",
	parameters: Type.Object({
		suggestions: Type.Array(
			Type.String({
				description: "用户会直接打字发送的一句话：第一人称、具体、口语化，不超过 30 字。",
			}),
			{
				description: "0 到 3 条建议，按可能性从高到低排序；没有合理的后续追问时给空数组。",
				maxItems: 3,
			},
		),
	}),
};

/** 清洗建议数组：去围栏/引号、去空、去重，最多保留 3 条。 */
export function cleanSuggestionList(items: unknown[]): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const item of items) {
		if (typeof item !== "string") continue;
		const cleaned = item
			.replace(/^[\s"'`「『《<[(（【“”‘’]+/, "")
			.replace(/[\s"'`」』》>\])）】“”‘’]+$/, "")
			.trim();
		if (!cleaned || seen.has(cleaned)) continue;
		seen.add(cleaned);
		result.push(cleaned);
		if (result.length >= 3) break;
	}
	return result;
}

/**
 * 文本兜底解析：当模型未调用工具时，从其文本/思考里**只**抽取 JSON 字符串数组。
 * 扫描所有不嵌套的 `[...]` 片段，取最后一个能 JSON.parse 成「字符串数组」的，
 * 这样推理散文与 `[step 1]` 等方括号都不会被误当建议泄漏。
 */
export function sanitizeSuggestions(raw: string): string[] {
	if (!raw) return [];
	let chosen: string[] | null = null;
	for (const m of raw.matchAll(/\[[^[\]]*\]/g)) {
		let parsed: unknown;
		try {
			parsed = JSON.parse(m[0]);
		} catch {
			continue;
		}
		if (Array.isArray(parsed) && parsed.every((v) => typeof v === "string")) {
			chosen = parsed as string[];
		}
	}
	return chosen ? cleanSuggestionList(chosen) : [];
}

export function sanitizeAutoTitle(raw: string): string {
	if (!raw) return "";
	// Reasoning models often emit a long internal monologue ending with the
	// final short answer. Heuristic: prefer the LAST non-empty line if it is
	// reasonably short (≤ 30 chars), else fall back to the first non-empty line.
	const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
	if (lines.length === 0) return "";
	const lastLine = lines[lines.length - 1];
	const firstLine = lines[0];
	const candidate = Array.from(lastLine.trim()).length <= 30 ? lastLine : firstLine;
	// Strip leading/trailing whitespace and any special characters so both ends
	// are alphanumeric (letters, including CJK, or digits).
	const stripped = candidate.replace(/^[^\p{L}\p{N}]+/u, "").replace(/[^\p{L}\p{N}]+$/u, "");
	if (!stripped) return "";
	// Hard cap at 14 chars (Array.from to count code points correctly).
	const chars = Array.from(stripped);
	return chars.length > 14 ? chars.slice(0, 14).join("") : stripped;
}

/**
 * Generate a short title from the first round of conversation.
 * Returns the cleaned title, or null when no model is available / all failed.
 * Caller is responsible for persisting via setSessionName.
 */
export async function generateAutoTitle(
	source: PeripheralModelSource,
	sessionId: string,
	userText: string,
	assistantText: string,
): Promise<string | null> {
	const trimmedUser = userText.trim().slice(0, 800);
	const trimmedAssistant = assistantText.trim().slice(0, 1500);
	const promptText =
		`请为下面这段对话生成一个 10 到 20 个字符之间的中文短标题，用来在侧边栏标识这个会话。\n` +
		`要求：只输出标题本身；不要引号、书名号、句号、感叹号或其他标点；不要任何解释或前后缀。\n\n` +
		`<用户消息>\n${trimmedUser}\n</用户消息>\n\n` +
		`<助手回复>\n${trimmedAssistant}\n</助手回复>`;

	return runWithPeripheralFailover(source, `autoTitleSession session=${sessionId}`, async (candidate) => {
		const { model, apiKey, reasoning, key } = candidate;
		const startedAt = Date.now();
		console.log(
			`[autoTitleSession] session=${sessionId} model=${key} userLen=${userText.length} assistantLen=${assistantText.length}`,
		);
		const response = await completeSimple(
			model,
			{
				systemPrompt: "你是会话标题生成器。严格按用户要求只输出一个简短中文标题。",
				messages: [
					{
						role: "user" as const,
						content: [{ type: "text" as const, text: promptText }],
						timestamp: Date.now(),
					},
				],
			},
			// reasoning = API 最轻安全档，使 reasoning 模型把答案写到 text 通道。
			{ apiKey, maxTokens: 256, reasoning },
		);
		const durationMs = Date.now() - startedAt;
		if (response.stopReason === "error") {
			console.warn(
				`[autoTitleSession] session=${sessionId} model=${key} durationMs=${durationMs} stopReason=error message=${
					(response as { errorMessage?: string }).errorMessage ?? "(none)"
				}`,
			);
			return null;
		}
		const rawText = response.content
			.filter((c): c is TextContent => c.type === "text")
			.map((c) => c.text)
			.join("")
			.trim();
		// Fallback: some reasoning models (e.g. gpt-oss) route the whole short
		// answer through the thinking channel. Use thinking content as a
		// candidate when no plain text was produced.
		const rawThinking = response.content
			.filter((c): c is { type: "thinking"; thinking: string } => c.type === "thinking")
			.map((c) => c.thinking)
			.join("\n")
			.trim();
		const raw = rawText || rawThinking;
		const title = sanitizeAutoTitle(raw);
		console.log(
			`[autoTitleSession] session=${sessionId} model=${key} durationMs=${durationMs} textLen=${rawText.length} thinkingLen=${rawThinking.length} cleaned=${JSON.stringify(title)}`,
		);
		return title || null;
	});
}

/**
 * 输入预测：基于最近几轮对话，预测用户下一个可能输入的 prompt。
 * 返回 0-3 条建议。无可用模型或全部失败时返回 []。
 * 模型成功返回空建议视为合法结果，不轮转。
 */
export async function generateNextPromptSuggestions(
	source: PeripheralModelSource,
	sessionId: string,
	conversation: string,
): Promise<string[]> {
	const trimmed = conversation.trim().slice(0, 4000);
	if (!trimmed) return [];

	const promptText =
		`下面是用户与 AI 助手最近的对话。请站在【用户】的角度，预测用户接下来最可能【亲自打字发给助手】的下一句话。\n\n` +
		`要求：\n` +
		`- 每条必须是用户会直接发送的一句话：第一人称、口语化、具体。例如「再写一个悲伤点的结局」「把这个故事翻译成英文」「帮我把刚才的代码加上注释」。\n` +
		`- 禁止输出对用户意图的分析、第三人称描述、任何思考过程或解释。只给用户会说的话本身。\n` +
		`- 0 到 3 条，按可能性从高到低；对话已自然收尾、没有合理后续时给空数组。每条不超过 30 字。\n` +
		`- 必须通过调用 provide_prompt_suggestions 工具提交结果（suggestions 字段），不要用普通文本回答。\n\n` +
		`<对话>\n${trimmed}\n</对话>`;

	// null = 调用失败需轮转；[] = 成功但无建议（合法，不轮转）。
	const result = await runWithPeripheralFailover(
		source,
		`nextPromptSuggestions session=${sessionId}`,
		async (candidate) => {
			const { model, apiKey, reasoning, key } = candidate;
			const response = await completeSimple(
				model,
				{
					systemPrompt:
						"你是输入预测器，模拟用户口吻预测其下一句输入。必须调用 provide_prompt_suggestions 工具，把 0-3 条用户第一人称的具体提问/指令放入 suggestions 字段提交，不含任何分析或思考过程。",
					messages: [
						{
							role: "user" as const,
							content: [{ type: "text" as const, text: promptText }],
							timestamp: Date.now(),
						},
					],
					tools: [SUGGESTIONS_TOOL],
				},
				{ apiKey, maxTokens: 800, reasoning },
			);
			if (response.stopReason === "error") {
				console.warn(
					`[nextPromptSuggestions] session=${sessionId} model=${key} stopReason=error message=${
						(response as { errorMessage?: string }).errorMessage ?? "(none)"
					}`,
				);
				return null;
			}
			// 首选：结构化工具调用，arguments 已是解析好的对象（JSON schema 保证形状）。
			const toolCall = response.content.find(
				(c): c is ToolCall => c.type === "toolCall" && c.name === SUGGESTIONS_TOOL.name,
			);
			if (toolCall) {
				const rawList = (toolCall.arguments as { suggestions?: unknown }).suggestions;
				return Array.isArray(rawList) ? cleanSuggestionList(rawList) : [];
			}
			// 兜底：模型没调用工具，从正式回答 / 思考通道里扫 JSON 数组（仅认 JSON，
			// 思考散文不会被误当建议泄漏）。
			const rawText = response.content
				.filter((c): c is TextContent => c.type === "text")
				.map((c) => c.text)
				.join("")
				.trim();
			const rawThinking = response.content
				.filter((c): c is { type: "thinking"; thinking: string } => c.type === "thinking")
				.map((c) => c.thinking)
				.join("\n")
				.trim();
			const fromText = sanitizeSuggestions(rawText);
			if (fromText.length > 0) return fromText;
			const fromThinking = sanitizeSuggestions(rawThinking);
			if (fromThinking.length > 0) return fromThinking;
			// 成功响应但解析不出建议：视为合法空结果（对话可能已收尾），不轮转。
			return [];
		},
	);
	return result ?? [];
}
