/**
 * Steering / follow-up / next-turn message queues.
 *
 * Extracted from AgentSession. Owns the three pending-message lists and their
 * interaction with the agent's own queues. The facade still handles command
 * checks / skill+template expansion / image normalization before enqueuing.
 */

import type { AgentMessage } from "@astravia/agent-core";
import type { ImageContent, TextContent } from "@astravia/ai";
import type { CustomMessage } from "../messages.js";
import type { SessionContext } from "./session-context.js";

export class QueueController {
	/** Tracks pending steering messages for UI display. Removed when delivered. */
	private _steeringMessages: string[] = [];
	/** Tracks pending follow-up messages for UI display. Removed when delivered. */
	private _followUpMessages: string[] = [];
	/** Messages queued to be included with the next user prompt as context ("asides"). */
	private _pendingNextTurnMessages: CustomMessage[] = [];

	constructor(private readonly ctx: SessionContext) {}

	/** Queue a steering message (already expanded). */
	queueSteer(text: string, images?: ImageContent[]): void {
		this._steeringMessages.push(text);
		const content: (TextContent | ImageContent)[] = [{ type: "text", text }];
		if (images) {
			content.push(...images);
		}
		this.ctx.agent.steer({
			role: "user",
			content,
			timestamp: Date.now(),
		});
	}

	/** Queue a follow-up message (already expanded). */
	queueFollowUp(text: string, images?: ImageContent[]): void {
		this._followUpMessages.push(text);
		const content: (TextContent | ImageContent)[] = [{ type: "text", text }];
		if (images) {
			content.push(...images);
		}
		this.ctx.agent.followUp({
			role: "user",
			content,
			timestamp: Date.now(),
		});
	}

	/** Queue a message to be included alongside the next user prompt. */
	pushNextTurn(message: CustomMessage): void {
		this._pendingNextTurnMessages.push(message);
	}

	/** Take and clear the pending next-turn messages. */
	takeNextTurn(): AgentMessage[] {
		const messages = this._pendingNextTurnMessages;
		this._pendingNextTurnMessages = [];
		return messages;
	}

	/**
	 * When a user message starts streaming, remove it from whichever queue it
	 * came from so the UI reflects the updated queue state.
	 */
	onUserMessageDelivered(messageText: string): void {
		if (!messageText) return;
		// Check steering queue first
		const steeringIndex = this._steeringMessages.indexOf(messageText);
		if (steeringIndex !== -1) {
			this._steeringMessages.splice(steeringIndex, 1);
		} else {
			// Check follow-up queue
			const followUpIndex = this._followUpMessages.indexOf(messageText);
			if (followUpIndex !== -1) {
				this._followUpMessages.splice(followUpIndex, 1);
			}
		}
	}

	/** Clear steering + follow-up queues (and the agent's queues), returning what was cleared. */
	clear(): { steering: string[]; followUp: string[] } {
		const steering = [...this._steeringMessages];
		const followUp = [...this._followUpMessages];
		this._steeringMessages = [];
		this._followUpMessages = [];
		this.ctx.agent.clearAllQueues();
		return { steering, followUp };
	}

	/** Reset all three queues (no agent interaction). */
	reset(): void {
		this._steeringMessages = [];
		this._followUpMessages = [];
		this._pendingNextTurnMessages = [];
	}

	/** Reset only the next-turn queue. */
	resetNextTurn(): void {
		this._pendingNextTurnMessages = [];
	}

	get pendingCount(): number {
		return this._steeringMessages.length + this._followUpMessages.length;
	}

	get steeringMessages(): readonly string[] {
		return this._steeringMessages;
	}

	get followUpMessages(): readonly string[] {
		return this._followUpMessages;
	}
}
