/**
 * Build todo continuation follow-up messages.
 *
 * Extracted from AgentSession. Pure function: the previous nudge signature is
 * passed in and the next one returned, so the facade owns the mutable state.
 */

import type { AgentMessage } from "@astravia/agent-core";
import type { CustomEntry, SessionManager } from "../session-manager/index.js";
import { TODO_SNAPSHOT_TYPE, type TodoSnapshot, type TodoStore } from "../todo-store.js";

/** Restore todo state from the latest todo_snapshot in the session branch. */
export function restoreTodoFromSession(sessionManager: SessionManager, todoStore: TodoStore): void {
	const branch = sessionManager.getBranch();
	let latestSnapshot: TodoSnapshot | undefined;
	for (const entry of branch) {
		if (entry.type === "custom") {
			const custom = entry as CustomEntry;
			if (custom.customType === TODO_SNAPSHOT_TYPE) {
				latestSnapshot = custom.data as TodoSnapshot;
			}
		}
	}
	if (!latestSnapshot) return;
	const itemCount = Array.isArray(latestSnapshot) ? latestSnapshot.length : latestSnapshot.items.length;
	if (itemCount > 0) {
		todoStore.restoreFromSnapshot(latestSnapshot);
	}
}

export interface TodoContinuationResult {
	messages: AgentMessage[];
	/** New value for the ad-hoc nudge signature (caller persists it). */
	nextNudgeSignature: string | undefined;
}

/**
 * Build follow-up messages for uncompleted todo items.
 * Called by the agent core's continuationProvider INSIDE the loop, before the agent
 * decides whether to exit.
 */
export function buildTodoContinuationMessages(
	todoStore: TodoStore,
	lastNudgeSignature: string | undefined,
): TodoContinuationResult {
	const items = todoStore.getAll();
	if (items.length === 0) return { messages: [], nextNudgeSignature: lastNudgeSignature };

	const pending = items.filter((i) => i.status !== "done");
	if (pending.length === 0) return { messages: [], nextNudgeSignature: lastNudgeSignature };

	// Sort by ID to ensure sequential order
	pending.sort((a, b) => a.id - b.id);
	const nextItem = pending[0];
	const pendingList = pending.map((i) => `  #${i.id} ${i.content}`).join("\n");
	const doneCount = items.length - pending.length;

	// Locked lists are STRICT: relentlessly force sequential completion —
	// the agent cannot exit the loop while any item remains.
	if (todoStore.isLocked()) {
		return {
			messages: [
				{
					role: "user",
					content: [
						{
							type: "text",
							text: `[ephemeral:todo] You have ${pending.length} uncompleted todo items (${doneCount}/${items.length} done). You MUST continue working on them before stopping.\n\nRemaining:\n${pendingList}\n\nYou MUST work on item #${nextItem.id} next: "${nextItem.content}"\nCall todo(action="update", id=${nextItem.id}, status="in_progress") first, then do the work, then mark it done. Do NOT skip to a later item.`,
						},
					],
					timestamp: Date.now(),
				},
			],
			nextNudgeSignature: lastNudgeSignature,
		};
	}

	// Ad-hoc (unlocked) lists are LOOSE: nudge once with an escape hatch. If the model
	// tries to stop again with the same pending set (no progress, no clear), release it
	// so a user redirect isn't trapped behind a stale plan.
	const signature = pending.map((i) => `${i.id}:${i.status}`).join(",");
	if (signature === lastNudgeSignature) {
		return { messages: [], nextNudgeSignature: undefined };
	}

	return {
		messages: [
			{
				role: "user",
				content: [
					{
						type: "text",
						text: `[ephemeral:todo] You still have ${pending.length} uncompleted todo items (${doneCount}/${items.length} done):\n${pendingList}\n\nIf this plan still applies, keep going — work on item #${nextItem.id} next ("${nextItem.content}"): call todo(action="update", id=${nextItem.id}, status="in_progress"). You may reprioritize freely.\nIf the user's latest request has superseded this plan, call todo(action="clear") to abandon it, then proceed with what the user actually wants.`,
					},
				],
				timestamp: Date.now(),
			},
		],
		nextNudgeSignature: signature,
	};
}
