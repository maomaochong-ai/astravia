import { type Static, Type } from "@sinclair/typebox";
import type { CodingAgentTool } from "../../session/tool-scope.js";
import { toolCallDescriptionSchema } from "../../tools/tool-call-description.js";
import type { SubagentCoordinator } from "../coordinator.js";

const sendMessageSchema = Type.Object({
	description: toolCallDescriptionSchema,
	target: Type.String({ description: "Child id, task_name, or /root/<task_name>" }),
	message: Type.String({ description: "Constraint or context to inject; does not start a new turn by itself." }),
});

export type SendMessageToolInput = Static<typeof sendMessageSchema>;

export function createSendMessageTool(options: {
	getCoordinator: () => SubagentCoordinator | undefined;
}): CodingAgentTool<typeof sendMessageSchema> {
	return {
		name: "send_message",
		label: "send_message",
		scope_use: ["conversation", "project", "cli"],
		category: "agent-control",
		description:
			"Add a message to a subagent's next-turn context without forcing a turn start. Not guaranteed to interrupt the current tool mid-flight; use for constraints/clarifications.",
		parameters: sendMessageSchema,
		execute: async (_toolCallId, input: SendMessageToolInput) => {
			const coord = options.getCoordinator();
			if (!coord) throw new Error("Subagents are not enabled for this session.");
			const snap = await coord.sendMessage(input.target, input.message);
			return {
				content: [{ type: "text" as const, text: `Message queued for ${snap.id} (${snap.path}).` }],
				details: { ...snap },
			};
		},
	};
}
