import { type Static, Type } from "@sinclair/typebox";
import type { CodingAgentTool } from "../../session/tool-scope.js";
import { loadToolDescription } from "../description.js";
import { toolCallDescriptionSchema } from "../tool-call-description.js";

const progressSchema = Type.Object({
	description: toolCallDescriptionSchema,
	summary: Type.Optional(
		Type.String({
			description:
				"Completed-state title for the PREVIOUS stage, in the user's language (max 40 chars). Omit on the very first call.",
			maxLength: 40,
		}),
	),
	label: Type.Optional(
		Type.String({
			description:
				"In-progress title for the stage you are STARTING now, in the user's language (max 40 chars). Omit only when closing the final stage without starting a new one.",
			maxLength: 40,
		}),
	),
});

export type ProgressToolInput = Static<typeof progressSchema>;

export interface ProgressToolDetails {
	label?: string;
	summary?: string;
}

export function createProgressTool(): CodingAgentTool<typeof progressSchema, ProgressToolDetails> {
	const fallbackDescription =
		"Announce what you are about to do next, so the user sees readable stages instead of raw tool calls.";
	const description = loadToolDescription("progress", fallbackDescription);

	return {
		name: "progress",
		label: "Progress",
		scope_use: ["im-claw", "conversation", "project", "batch", "automation", "kb-processing", "cli"],
		category: "agent-control",
		agent_mode: ["work"],
		description,
		parameters: progressSchema,
		execute: async (_toolCallId: string, { label, summary }: ProgressToolInput) => {
			if (!label && !summary) {
				return {
					content: [
						{
							type: "text" as const,
							text: 'Error: progress requires at least one of "label" (start a stage) or "summary" (close the previous stage).',
						},
					],
					details: {},
				};
			}
			// Display-only tool: the host renders label/summary. Nothing to compute.
			return {
				content: [{ type: "text" as const, text: "OK" }],
				details: { label, summary },
			};
		},
	};
}

/** Default progress tool instance */
export const progressTool = createProgressTool();
