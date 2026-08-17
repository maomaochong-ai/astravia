/**
 * Completion notification text + generation delivery tracking.
 */

import type { SubagentNotificationPayload, SubagentSnapshot } from "./types.js";
import { clipFinalText } from "./types.js";

/** Tracks which (childId, generation) pairs have been delivered. */
export class SubagentDeliveryTracker {
	private readonly delivered = new Set<string>();

	private key(id: string, generation: number): string {
		return `${id}#${generation}`;
	}

	isDelivered(id: string, generation: number): boolean {
		return this.delivered.has(this.key(id, generation));
	}

	markDelivered(id: string, generation: number): void {
		this.delivered.add(this.key(id, generation));
	}

	/** Prefer wait delivery over auto-notification. */
	tryClaim(id: string, generation: number): boolean {
		const k = this.key(id, generation);
		if (this.delivered.has(k)) return false;
		this.delivered.add(k);
		return true;
	}
}

export function buildSubagentNotification(agents: ReadonlyArray<SubagentSnapshot>): SubagentNotificationPayload {
	const lines: string[] = ["<subagent_notification>"];
	for (const a of agents) {
		lines.push(`id: ${a.id}`);
		lines.push(`path: ${a.path}`);
		lines.push(`type: ${a.agentType}`);
		lines.push(`task_name: ${a.taskName}`);
		if (a.title) lines.push(`title: ${a.title}`);
		lines.push(`status: ${a.status}`);
		if (a.status === "interrupted") {
			lines.push(
				"hint: resumable — use followup_task to continue this child with its context and todo progress intact; do NOT re-dispatch it as a new workflow",
			);
		}
		if (a.errorMessage) lines.push(`error: ${a.errorMessage}`);
		const text = clipFinalText(a.finalText);
		if (text) {
			lines.push("summary:");
			lines.push(text);
		}
		if (a.sessionFile) lines.push(`session_file: ${a.sessionFile}`);
		lines.push("---");
	}
	lines.push("</subagent_notification>");
	return { agents: [...agents], text: lines.join("\n") };
}
