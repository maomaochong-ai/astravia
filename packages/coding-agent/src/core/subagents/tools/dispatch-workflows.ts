import { type Static, Type } from "@sinclair/typebox";
import type { CodingAgentTool } from "../../session/tool-scope.js";
import { toolCallDescriptionSchema } from "../../tools/tool-call-description.js";
import type { SubagentCoordinator } from "../coordinator.js";
import { SUBAGENT_TYPE_WORKFLOW } from "../types.js";

/** Hard cap per dispatch batch (ADR-0044). */
export const DISPATCH_WORKFLOWS_MAX_BATCH = 8;

const workflowItemSchema = Type.Object({
	task_name: Type.String({
		description:
			"Unique snake_case id for this workflow (e.g. refactor_api). Lowercase letters, digits, underscore; start with a letter.",
	}),
	title: Type.String({
		description:
			"Human-readable one-line summary of this workflow, shown in the UI (e.g. 重构 API 鉴权层). Write it in the user's language.",
	}),
	message: Type.String({
		description:
			"Task brief for this workflow. It already sees a snapshot of this conversation; state its scope and deliverables.",
	}),
	todos: Type.Array(Type.String(), {
		minItems: 1,
		description: "Ordered todo items pre-filled into the workflow's own todo list.",
	}),
});

const dispatchWorkflowsSchema = Type.Object({
	description: toolCallDescriptionSchema,
	workflows: Type.Array(workflowItemSchema, {
		minItems: 1,
		maxItems: DISPATCH_WORKFLOWS_MAX_BATCH,
		description: `Workflows to dispatch in one batch (max ${DISPATCH_WORKFLOWS_MAX_BATCH}).`,
	}),
});

export type DispatchWorkflowsToolInput = Static<typeof dispatchWorkflowsSchema>;

export function createDispatchWorkflowsTool(options: {
	getCoordinator: () => SubagentCoordinator | undefined;
}): CodingAgentTool<typeof dispatchWorkflowsSchema> {
	return {
		name: "dispatch_workflows",
		label: "dispatch_workflows",
		scope_use: ["conversation", "project", "cli"],
		category: "agent-control",
		description: [
			"Dispatch N parallel workflow subagents in one batch. Each workflow is an independent session that",
			"inherits a snapshot of THIS conversation's context and starts from the todo list you assign it.",
			"",
			"All workflows are accepted immediately; those beyond the concurrency limit queue (status: queued)",
			"and start automatically when a slot frees. Returns immediately — you are notified per workflow via",
			"<subagent_notification> as each finishes. Do not block; keep working or end your turn.",
			"",
			"Split tasks into NON-OVERLAPPING scopes: workflows share the working directory, so two workflows",
			"must never edit the same files. Workflows cannot spawn agents themselves (single layer).",
			"Use interrupt_agent / send_message / followup_task with the task_name to control a workflow.",
			"",
			"RESUME, don't re-dispatch: an interrupted workflow keeps its full context and todo progress.",
			"To continue it, call followup_task(target: task_name, message: 'continue the remaining todos').",
			"Only dispatch NEW workflows for NEW scopes — dispatching again resets nothing for interrupted ones",
			"(their names stay reserved) and would duplicate work.",
		].join("\n"),
		parameters: dispatchWorkflowsSchema,
		execute: async (_toolCallId, input: DispatchWorkflowsToolInput) => {
			const coord = options.getCoordinator();
			if (!coord) {
				throw new Error("Subagents are not enabled for this session.");
			}
			const snaps = coord.spawnMany(
				input.workflows.map((w) => ({
					taskName: w.task_name,
					title: w.title,
					message: w.message,
					agentType: SUBAGENT_TYPE_WORKFLOW,
					todos: w.todos,
				})),
			);
			const lines = [`Dispatched ${snaps.length} workflow(s):`];
			for (const snap of snaps) {
				const todo = snap.todoProgress ? ` todos: ${snap.todoProgress.done}/${snap.todoProgress.total}` : "";
				lines.push(`- ${snap.taskName} [${snap.status}] id: ${snap.id}${todo}`);
			}
			lines.push(
				"You will receive <subagent_notification> as each workflow reaches a terminal state. Do NOT call wait_agent — end your turn (or continue other work) and handle the notifications passively.",
			);
			return {
				content: [{ type: "text" as const, text: lines.join("\n") }],
				details: { workflows: snaps },
			};
		},
	};
}
