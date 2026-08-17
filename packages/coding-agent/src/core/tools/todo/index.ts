import { Type } from "@sinclair/typebox";
import type { CodingAgentTool } from "../../session/tool-scope.js";
import type { TodoStore } from "../../todo-store.js";
import { loadToolDescription } from "../description.js";
import { toolCallDescriptionSchema } from "../tool-call-description.js";

const todoSchema = Type.Object({
	description: toolCallDescriptionSchema,
	action: Type.Union([Type.Literal("create"), Type.Literal("update"), Type.Literal("list"), Type.Literal("clear")], {
		description:
			'Action to perform: "create" (add items), "update" (change status), "list" (show all), or "clear" (abandon the current plan — only allowed for ad-hoc, non-locked lists)',
	}),
	items: Type.Optional(
		Type.Array(Type.String(), {
			description: 'For action="create": array of step descriptions to add',
		}),
	),
	id: Type.Optional(
		Type.Number({
			description: 'For action="update": the todo item ID to update',
		}),
	),
	status: Type.Optional(
		Type.Union([Type.Literal("pending"), Type.Literal("in_progress"), Type.Literal("done")], {
			description: 'For action="update": new status',
		}),
	),
});

export interface TodoToolDetails {
	action: string;
}

export interface TodoToolOptions {
	getTodoStore: () => TodoStore;
}

function formatItems(store: TodoStore): string {
	const items = store.getAll();
	if (items.length === 0) return "No todo items.";

	const statusIcon: Record<string, string> = {
		pending: "[ ]",
		in_progress: "[~]",
		done: "[x]",
	};

	const lines = items.map((item) => `${statusIcon[item.status]} #${item.id} ${item.content}`);

	const done = items.filter((i) => i.status === "done").length;
	const total = items.length;
	lines.push("", `Progress: ${done}/${total} completed`);

	return lines.join("\n");
}

export function createTodoTool(options: TodoToolOptions): CodingAgentTool<typeof todoSchema> {
	const fallbackDescription = "Manage a todo list to plan and track progress on multi-step tasks.";
	const description = loadToolDescription("todo", fallbackDescription);

	return {
		name: "todo",
		label: "todo",
		scope_use: ["im-claw", "conversation", "project", "batch", "automation", "kb-processing", "cli"],
		category: "agent-control",
		description,
		parameters: todoSchema,
		execute: async (
			_toolCallId: string,
			{
				action,
				items,
				id,
				status,
			}: { action: "create" | "update" | "list" | "clear"; items?: string[]; id?: number; status?: string },
		) => {
			const store = options.getTodoStore();

			switch (action) {
				case "create": {
					if (!items || items.length === 0) {
						return {
							content: [
								{ type: "text" as const, text: 'Error: action="create" requires a non-empty "items" array.' },
							],
							details: { action },
						};
					}
					if (store.isLocked()) {
						const source = store.getLockSource();
						return {
							content: [
								{
									type: "text" as const,
									text:
										`REJECTED: The todo list is locked by ${source ?? "the system"} and cannot accept new items.\n` +
										`This list was prefilled by the host and is the authoritative plan.\n` +
										`Do NOT attempt to create additional todos. Work strictly through the existing items in order:\n` +
										`call todo(action="list") to view them, then todo(action="update", id=N, status="in_progress"|"done").\n\n${formatItems(store)}`,
								},
							],
							details: { action },
						};
					}
					if (store.getAll().length > 0) {
						return {
							content: [
								{
									type: "text" as const,
									text:
										`REJECTED: A todo list already exists. Do not append a new plan to an existing plan.\n` +
										`Call todo(action="list") to review the current plan. If the current plan is obsolete, call todo(action="clear") first, then create the new plan. If it is still relevant, continue updating the existing items.\n\n${formatItems(store)}`,
								},
							],
							details: { action },
						};
					}
					const created = store.createMany(items);
					const itemList = created.map((i) => `  #${i.id} ${i.content}`).join("\n");
					return {
						content: [
							{
								type: "text" as const,
								text: `Created ${created.length} todo items:\n${itemList}\n\n${formatItems(store)}`,
							},
						],
						details: { action },
					};
				}

				case "update": {
					if (id === undefined || !status) {
						return {
							content: [
								{ type: "text" as const, text: 'Error: action="update" requires "id" (number) and "status".' },
							],
							details: { action },
						};
					}

					// Sequential order is enforced ONLY for locked lists — they are the
					// authoritative plan and must be worked strictly in order. Ad-hoc lists are
					// flexible: the model may reprioritize / update out of order.
					if (store.isLocked() && (status === "in_progress" || status === "done")) {
						const allItems = store.getAll();
						const skipped = allItems.filter((i) => i.id < id && i.status !== "done");
						if (skipped.length > 0) {
							const firstSkipped = skipped[0];
							const skippedList = skipped.map((i) => `  #${i.id} [${i.status}] ${i.content}`).join("\n");
							// REJECT the update — do NOT apply it. Force sequential order.
							return {
								content: [
									{
										type: "text" as const,
										text: `REJECTED: Cannot update #${id} to "${status}" because earlier items are not done:\n${skippedList}\n\nYou MUST complete items in order. Work on #${firstSkipped.id} first: "${firstSkipped.content}"\nCall todo(action="update", id=${firstSkipped.id}, status="in_progress") to start it.\n\n${formatItems(store)}`,
									},
								],
								details: { action },
							};
						}
					}

					const updated = store.update(id, status as "pending" | "in_progress" | "done");
					if (!updated) {
						return {
							content: [{ type: "text" as const, text: `Error: todo item #${id} not found.` }],
							details: { action },
						};
					}
					return {
						content: [
							{
								type: "text" as const,
								text: `Updated #${updated.id} → ${updated.status}\n\n${formatItems(store)}`,
							},
						],
						details: { action },
					};
				}

				case "list": {
					return {
						content: [{ type: "text" as const, text: formatItems(store) }],
						details: { action },
					};
				}

				case "clear": {
					if (store.isLocked()) {
						const source = store.getLockSource();
						return {
							content: [
								{
									type: "text" as const,
									text:
										`REJECTED: The todo list is locked by ${source ?? "the system"} and cannot be cleared.\n` +
										`This list is the authoritative plan — work strictly through the existing items in order.\n\n${formatItems(store)}`,
								},
							],
							details: { action },
						};
					}
					if (store.getAll().length === 0) {
						return {
							content: [{ type: "text" as const, text: "Todo list is already empty." }],
							details: { action },
						};
					}
					store.clear();
					return {
						content: [
							{
								type: "text" as const,
								text: 'Cleared all todo items. Create a fresh plan with todo(action="create") if the new direction needs one.',
							},
						],
						details: { action },
					};
				}

				default: {
					return {
						content: [
							{
								type: "text" as const,
								text: `Error: unknown action "${action}". Use "create", "update", "list", or "clear".`,
							},
						],
						details: { action: String(action) },
					};
				}
			}
		},
	};
}
