import type { AgentMessage } from "@astravia/agent-core";
import type { ImageContent, TextContent, ToolResultMessage, UserMessage } from "@astravia/ai";

const IMAGE_OMITTED_PLACEHOLDER = "[earlier image omitted to conserve memory]";

type MessageWithImageContent = UserMessage | ToolResultMessage;

function carriesImageContent(msg: AgentMessage): msg is MessageWithImageContent {
	if (!msg || typeof msg !== "object") return false;
	const role = (msg as { role?: unknown }).role;
	if (role !== "user" && role !== "toolResult") return false;
	const content = (msg as { content?: unknown }).content;
	return Array.isArray(content);
}

/**
 * Keep at most `budget` most-recent *already-seen* images in the message stream.
 *
 * "Seen" is determined structurally: any image sitting after the last assistant
 * message has never been shown to the model yet — the upcoming LLM call is its
 * first viewing — so it is kept unconditionally regardless of budget. This is
 * the hard guarantee that a batch of freshly `read` images is never dropped
 * before the model gets to look at it even once (fixes "read == not read").
 *
 * Images at or before the last assistant message have been seen at least once;
 * only these are subject to the budget. Older seen ImageContent beyond the
 * budget is replaced with a short text placeholder so the model still sees a
 * marker for the dropped attachment without paying its visual-token cost.
 *
 * Note: this intentionally no longer caps the number of *unseen* images, so it
 * does not by itself protect memory-constrained local VL models from OOM on a
 * large batch read — that is delegated to prompt-level guidance ("read images
 * one at a time"). See ADR-0012.
 *
 * Pass `budget <= 0` to disable the filter (all images are kept).
 */
export function applyImageBudget(messages: AgentMessage[], budget: number): AgentMessage[] {
	if (!Number.isFinite(budget) || budget <= 0) {
		return messages;
	}

	// Index of the last assistant message. Images after it are unseen.
	let lastAssistantIdx = -1;
	for (let i = messages.length - 1; i >= 0; i--) {
		if ((messages[i] as { role?: unknown }).role === "assistant") {
			lastAssistantIdx = i;
			break;
		}
	}

	let remaining = budget;
	let mutated = false;
	const reversedResult: AgentMessage[] = [];

	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i];

		// Unseen images (after the last assistant message) are kept untouched.
		if (i > lastAssistantIdx) {
			reversedResult.push(msg);
			continue;
		}

		if (!carriesImageContent(msg)) {
			reversedResult.push(msg);
			continue;
		}

		const content = msg.content as (TextContent | ImageContent)[];
		if (!content.some((c) => c.type === "image")) {
			reversedResult.push(msg);
			continue;
		}

		// Walk content backward so that within a single message we keep the
		// newest images and drop the oldest when budget runs out mid-message.
		let touched = false;
		const reversedContent: (TextContent | ImageContent)[] = [];
		for (let j = content.length - 1; j >= 0; j--) {
			const item = content[j];
			if (item.type === "image") {
				if (remaining > 0) {
					remaining--;
					reversedContent.push(item);
				} else {
					touched = true;
					reversedContent.push({ type: "text", text: IMAGE_OMITTED_PLACEHOLDER });
				}
			} else {
				reversedContent.push(item);
			}
		}

		if (touched) {
			mutated = true;
			reversedResult.push({ ...msg, content: reversedContent.reverse() });
		} else {
			reversedResult.push(msg);
		}
	}

	return mutated ? reversedResult.reverse() : messages;
}
