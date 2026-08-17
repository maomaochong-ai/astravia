import { type Static, Type } from "@sinclair/typebox";
import type { CodingAgentTool } from "../../session/tool-scope.js";
import { toolCallDescriptionSchema } from "../../tools/tool-call-description.js";
import type { SubagentCoordinator } from "../coordinator.js";

const followupTaskSchema = Type.Object({
	description: toolCallDescriptionSchema,
	target: Type.String({ description: "Child id, task_name, or /root/<task_name>" }),
	message: Type.String({ description: "Follow-up task for the same child transcript." }),
});

export type FollowupTaskToolInput = Static<typeof followupTaskSchema>;

export function createFollowupTaskTool(options: {
	getCoordinator: () => SubagentCoordinator | undefined;
}): CodingAgentTool<typeof followupTaskSchema> {
	return {
		name: "followup_task",
		label: "followup_task",
		scope_use: ["conversation", "project", "cli"],
		category: "agent-control",
		description:
			"Continue work on an existing subagent, reusing its transcript. If terminal, starts a new run; if running, queues follow-up for the natural stop point. " +
			"This is THE way to resume an interrupted workflow: its context and todo progress are preserved — never re-dispatch it as a new workflow.",
		parameters: followupTaskSchema,
		execute: async (_toolCallId, input: FollowupTaskToolInput) => {
			const coord = options.getCoordinator();
			if (!coord) throw new Error("Subagents are not enabled for this session.");
			const snap = await coord.followUp(input.target, input.message);
			return {
				content: [
					{
						type: "text" as const,
						text: `Follow-up dispatched to ${snap.id} (${snap.path}), status=${snap.status}`,
					},
				],
				details: { ...snap },
			};
		},
	};
}
