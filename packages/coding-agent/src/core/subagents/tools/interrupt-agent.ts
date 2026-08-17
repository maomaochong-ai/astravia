import { type Static, Type } from "@sinclair/typebox";
import type { CodingAgentTool } from "../../session/tool-scope.js";
import { toolCallDescriptionSchema } from "../../tools/tool-call-description.js";
import type { SubagentCoordinator } from "../coordinator.js";

const interruptAgentSchema = Type.Object({
	description: toolCallDescriptionSchema,
	target: Type.String({
		description: "Child id, task_name, or /root/<task_name>",
	}),
});

export type InterruptAgentToolInput = Static<typeof interruptAgentSchema>;

export function createInterruptAgentTool(options: {
	getCoordinator: () => SubagentCoordinator | undefined;
}): CodingAgentTool<typeof interruptAgentSchema> {
	return {
		name: "interrupt_agent",
		label: "interrupt_agent",
		scope_use: ["conversation", "project", "cli"],
		category: "agent-control",
		description:
			"Abort a running/pending subagent run. Transcript is kept; status becomes interrupted. Can followup_task later.",
		parameters: interruptAgentSchema,
		execute: async (_toolCallId, input: InterruptAgentToolInput) => {
			const coord = options.getCoordinator();
			if (!coord) throw new Error("Subagents are not enabled for this session.");
			const snap = coord.interrupt(input.target);
			return {
				content: [
					{
						type: "text" as const,
						text: `Subagent ${snap.id} (${snap.path}) status=${snap.status}`,
					},
				],
				details: { ...snap },
			};
		},
	};
}
