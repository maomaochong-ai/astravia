import { type Static, Type } from "@sinclair/typebox";
import type { BackgroundTaskManager, BackgroundTaskStatus } from "../../background-tasks/index.js";
import type { CodingAgentTool } from "../../session/tool-scope.js";
import { loadToolDescription } from "../description.js";
import { toolCallDescriptionSchema } from "../tool-call-description.js";

const taskStopSchema = Type.Object({
	description: toolCallDescriptionSchema,
	task_id: Type.String({ description: "Background task ID (e.g. b1) to terminate" }),
});

export type TaskStopToolInput = Static<typeof taskStopSchema>;

export interface TaskStopToolDetails {
	taskId: string;
	status: BackgroundTaskStatus;
}

export interface TaskStopToolOptions {
	getManager: () => BackgroundTaskManager;
}

export function createTaskStopTool(options: TaskStopToolOptions): CodingAgentTool<typeof taskStopSchema> {
	const fallbackDescription = "Terminate a running background task started via bash with run_in_background.";
	const description = loadToolDescription("task-stop", fallbackDescription);

	return {
		name: "task_stop",
		label: "task_stop",
		scope_use: ["im-claw", "conversation", "project", "batch", "automation", "kb-processing", "cli"],
		requires: ["bg-tasks"],
		category: "agent-control",
		description,
		parameters: taskStopSchema,
		execute: async (_toolCallId: string, { task_id }: TaskStopToolInput) => {
			const manager = options.getManager();
			const task = manager.get(task_id);
			if (!task) {
				throw new Error(`Background task "${task_id}" not found.`);
			}
			if (task.status !== "running") {
				return {
					content: [
						{
							type: "text" as const,
							text: `Task ${task.id} is not running (status: ${task.status}${task.exitCode !== undefined ? `, exit code ${task.exitCode}` : ""}).`,
						},
					],
					details: { taskId: task.id, status: task.status } satisfies TaskStopToolDetails,
				};
			}

			manager.kill(task_id, "agent");
			return {
				content: [
					{
						type: "text" as const,
						text: `Sent kill signal to task ${task.id} ("${task.command}"). A <task-notification> will confirm termination.`,
					},
				],
				details: { taskId: task.id, status: task.status } satisfies TaskStopToolDetails,
			};
		},
	};
}
