import { isAbsolute } from "node:path";
import { z } from "zod";
import type { PromptRequest } from "../../../../runtime-core/src/index.js";

export const promptResourceRefSchema = z
	.object({
		kind: z.enum(["skill"]),
		name: z.string().trim().min(1),
	})
	.passthrough();

export const promptAttachmentRefSchema = z
	.object({
		kind: z.enum(["file", "directory", "image"]),
		path: z.string().trim().min(1).refine(isAbsolute, "Attachment path must be absolute"),
	})
	.passthrough();

const promptImageSchema = z
	.object({
		type: z.literal("image"),
		data: z.string(),
		mimeType: z.string(),
	})
	.passthrough();

export const promptRequestSchema: z.ZodType<PromptRequest> = z
	.object({
		text: z.string().min(1),
		promptRef: promptResourceRefSchema.optional(),
		attachments: z.array(promptAttachmentRefSchema).optional(),
		images: z.array(promptImageSchema).optional(),
		streamingBehavior: z.enum(["steer", "followUp"]).optional(),
		modelKey: z.string().min(1).optional(),
		reasoning: z.string().min(1).optional(),
		metadata: z.record(z.string(), z.unknown()).optional(),
	})
	.passthrough();

export function parsePromptRequest(value: unknown): PromptRequest {
	const result = promptRequestSchema.safeParse(value);
	if (result.success) return result.data;
	const issue = result.error.issues[0];
	const path = issue?.path.map(String).join(".");
	throw new Error(`Invalid prompt request${path ? ` ${path}` : ""}${issue ? `: ${issue.message}` : ""}`);
}
