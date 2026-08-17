import { readFileSync } from "node:fs";
import { type Static, Type } from "@sinclair/typebox";
import type { BackgroundTaskManager, BackgroundTaskStatus } from "../../background-tasks/index.js";
import type { CodingAgentTool } from "../../session/tool-scope.js";
import { loadToolDescription } from "../description.js";
import { toolCallDescriptionSchema } from "../tool-call-description.js";
import { truncateTail } from "../truncate.js";

const taskOutputSchema = Type.Object({
	description: toolCallDescriptionSchema,
	task_id: Type.String({ description: "Background task ID (e.g. b1) returned by bash with run_in_background" }),
	from_start: Type.Optional(
		Type.Boolean({
			description:
				"Read from the beginning of the output instead of continuing after the last read (default: false)",
		}),
	),
});

export type TaskOutputToolInput = Static<typeof taskOutputSchema>;

export interface TaskOutputToolDetails {
	taskId: string;
	status: BackgroundTaskStatus;
	outputFile: string;
}

export interface TaskOutputToolOptions {
	getManager: () => BackgroundTaskManager;
}

export function createTaskOutputTool(options: TaskOutputToolOptions): CodingAgentTool<typeof taskOutputSchema> {
	const fallbackDescription =
		"Read output of a background task started via bash with run_in_background. Returns new output since the last read (incremental). Set from_start to re-read everything.";
	const description = loadToolDescription("task-output", fallbackDescription);

	return {
		name: "task_output",
		label: "task_output",
		scope_use: ["im-claw", "conversation", "project", "batch", "automation", "kb-processing", "cli"],
		requires: ["bg-tasks"],
		category: "agent-control",
		description,
		parameters: taskOutputSchema,
		execute: async (_toolCallId: string, { task_id, from_start }: TaskOutputToolInput) => {
			const manager = options.getManager();
			const task = manager.get(task_id);
			if (!task) {
				throw new Error(`Background task "${task_id}" not found.`);
			}

			const cursor = manager.consumeReadOffset(task_id);
			const start = from_start ? 0 : (cursor?.offset ?? 0);
			let chunk = "";
			try {
				const buffer = readFileSync(task.outputFile);
				chunk = buffer.subarray(start).toString("utf-8");
			} catch {
				// Output file may not exist yet (no output produced so far)
			}

			const statusLine =
				task.status === "running"
					? `Task ${task.id} is running (started ${new Date(task.startedAt).toISOString()})`
					: `Task ${task.id} ${task.status}${task.exitCode !== undefined ? ` (exit code ${task.exitCode})` : ""}`;

			let text: string;
			if (chunk) {
				const truncation = truncateTail(chunk);
				text = `${statusLine}\n\n${truncation.content}`;
				if (truncation.truncated) {
					text += `\n\n[Output truncated. Full output: ${task.outputFile}]`;
				}
			} else {
				text = `${statusLine}\n\n(no new output${from_start ? "" : " since last read"})`;
			}

			return {
				content: [{ type: "text" as const, text }],
				details: {
					taskId: task.id,
					status: task.status,
					outputFile: task.outputFile,
				} satisfies TaskOutputToolDetails,
			};
		},
	};
}
