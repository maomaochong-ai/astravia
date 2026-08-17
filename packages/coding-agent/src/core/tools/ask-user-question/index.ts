import { Type } from "@sinclair/typebox";
import type { CodingAgentTool } from "../../session/tool-scope.js";
import { loadToolDescription } from "../description.js";
import { toolCallDescriptionSchema } from "../tool-call-description.js";

/** Max length of a question's short `header` chip label. */
export const ASK_USER_QUESTION_HEADER_MAX = 24;

const optionSchema = Type.Object({
	label: Type.String({
		description:
			"The display text for this option that the user will see and select. Should be concise (1-5 words) and clearly describe the choice.",
	}),
	description: Type.String({
		description:
			"Explanation of what this option means or what will happen if chosen. Useful for conveying trade-offs or implications.",
	}),
	badges: Type.Optional(
		Type.Array(Type.String(), {
			description:
				'Optional short tags rendered as badges on this option and used to signal your guidance. Use ["推荐"] (or "Recommended") to mark the option you recommend; you may add other short tags (e.g. "更快", "成本低"). Badges are display-only hints, not the answer.',
		}),
	),
});

const questionSchema = Type.Object({
	question: Type.String({
		description:
			'The complete question to ask the user. Should be clear, specific, and end with a question mark. If multiSelect is true, phrase it accordingly (e.g. "Which features do you want to enable?").',
	}),
	header: Type.String({
		description: `Very short label (max ${ASK_USER_QUESTION_HEADER_MAX} chars) shown as a chip/tag. Examples: "鉴权方式", "依赖库", "实现方案".`,
	}),
	options: Type.Array(optionSchema, {
		minItems: 2,
		maxItems: 4,
		description:
			"The available choices. Must have 2-4 distinct, mutually-exclusive options (unless multiSelect is enabled). Do NOT add an 'Other' option — a free-text 'Other' input is always offered automatically.",
	}),
	multiSelect: Type.Optional(
		Type.Boolean({
			description:
				"Set true to let the user pick multiple options. Use when choices are not mutually exclusive. Default false.",
		}),
	),
});

export const askUserQuestionSchema = Type.Object({
	description: toolCallDescriptionSchema,
	questions: Type.Array(questionSchema, {
		minItems: 1,
		maxItems: 4,
		description:
			"Questions to ask the user (1-4). Put several related questions in one call rather than asking sequentially.",
	}),
});

export interface AskUserQuestionOption {
	label: string;
	description: string;
	badges?: string[];
}

export interface AskUserQuestionItem {
	question: string;
	header: string;
	options: AskUserQuestionOption[];
	multiSelect?: boolean;
}

export interface AskUserQuestionRequest {
	questions: AskUserQuestionItem[];
}

/** One question's resolved answer. `answers` holds the chosen option labels and/or free-text ("Other"); single-select => length 1. */
export interface AskUserQuestionAnswer {
	question: string;
	answers: string[];
}

/** Result handed back from the host UI. `cancelled` => user declined; `answers` is then empty. */
export interface AskUserQuestionResult {
	cancelled: boolean;
	answers: AskUserQuestionAnswer[];
}

export type AskUserQuestionFn = (
	request: AskUserQuestionRequest,
	signal?: AbortSignal,
) => Promise<AskUserQuestionResult>;

/**
 * Host-provided capability backing the ask_user_question tool. `isEnabled()` is
 * read live at each prompt so the tool can be toggled on/off without restarting
 * the session (see AgentSession._maybeReloadAskUserQuestionForPrompt).
 */
export interface AskUserQuestionCapability {
	isEnabled(): boolean;
	ask: AskUserQuestionFn;
}

export interface AskUserQuestionToolDetails {
	cancelled: boolean;
	answers: AskUserQuestionAnswer[];
}

export interface AskUserQuestionToolInput {
	questions: AskUserQuestionItem[];
}

export interface AskUserQuestionToolOptions {
	ask: AskUserQuestionFn;
}

const FALLBACK_DESCRIPTION = [
	"Ask the user one or more multiple-choice questions during execution, then block until they answer.",
	"Use it to clarify ambiguity, gather preferences/requirements, or get a decision on an implementation choice — not for choices with an obvious default or facts you can verify yourself.",
	"Put related questions in ONE call (1-4 questions); each question has 2-4 options.",
	'Do NOT add an "Other" option — a free-text input is always offered automatically.',
	'To recommend an option, add a badge (e.g. ["推荐"]) and make it the first option; badges are display-only guidance.',
	"Set multiSelect: true only when more than one option may legitimately be chosen.",
	"If the user cancels you are told they declined; proceed without their input.",
].join(" ");

function formatResultText(result: AskUserQuestionResult): string {
	if (result.cancelled || result.answers.length === 0) {
		return "User declined to answer the question(s). Decide how to proceed without their input.";
	}
	const parts = result.answers.map((a) => `"${a.question}"="${a.answers.join(", ")}"`);
	return `User has answered your questions: ${parts.join(", ")}. You can now continue with the user's answers in mind.`;
}

/**
 * Create the ask_user_question tool. The tool blocks until the host UI returns
 * the user's answers (or a cancellation). The `ask` callback bridges to the
 * runtime's user-question handler.
 */
export function createAskUserQuestionTool(
	options: AskUserQuestionToolOptions,
): CodingAgentTool<typeof askUserQuestionSchema, AskUserQuestionToolDetails> {
	const description = loadToolDescription("ask-user-question", FALLBACK_DESCRIPTION);
	return {
		name: "ask_user_question",
		label: "Ask User",
		scope_use: ["conversation", "project"],
		requires: ["host:ask"],
		category: "agent-control",
		description,
		parameters: askUserQuestionSchema,
		execute: async (_toolCallId: string, params: AskUserQuestionToolInput, signal?: AbortSignal) => {
			const request: AskUserQuestionRequest = {
				questions: params.questions.map((q) => ({
					question: q.question,
					header: q.header,
					multiSelect: q.multiSelect ?? false,
					options: q.options.map((o) => ({ label: o.label, description: o.description, badges: o.badges })),
				})),
			};
			const result = await options.ask(request, signal);
			return {
				content: [{ type: "text", text: formatResultText(result) }],
				details: { cancelled: result.cancelled, answers: result.answers },
			};
		},
	};
}
