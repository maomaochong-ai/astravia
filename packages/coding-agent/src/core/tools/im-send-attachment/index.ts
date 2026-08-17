import { existsSync, statSync } from "node:fs";
import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "../../extensions/types.js";
import { loadToolDescription } from "../description.js";
import { toolCallDescriptionSchema } from "../tool-call-description.js";

const imSendAttachmentSchema = Type.Object({
	description: toolCallDescriptionSchema,
	path: Type.String({ description: "Absolute path to the local file to send." }),
	kind: Type.Union([Type.Literal("image"), Type.Literal("file")], {
		description: "image = render inline (jpg/png/gif/webp); file = everything else.",
	}),
	caption: Type.Optional(Type.String({ description: "Optional short text accompanying the attachment." })),
});

export interface ImSendAttachmentToolDetails {
	messageId?: string;
	kind: "image" | "file";
	path: string;
}

/**
 * Host bridge handle that the `im_send_attachment` tool calls into. The
 * concrete implementation is supplied by `runRpcMode` when the agent was
 * started with `--enable-host-bridge`; it round-trips a `host_request` to
 * the host process (im-gateway) and awaits the matching `host_response`.
 */
export interface ImHostBridge {
	sendAttachment(params: { path: string; kind: "image" | "file"; caption?: string }): Promise<{ messageId?: string }>;
}

/**
 * Build the im_send_attachment tool bound to a host bridge. The tool is not
 * exported as a singleton — it must be constructed per-session so that the
 * bridge handle is closed over.
 */
export function createImSendAttachmentTool(
	bridge: ImHostBridge,
): ToolDefinition<typeof imSendAttachmentSchema, ImSendAttachmentToolDetails> {
	const fallbackDescription =
		"Send a local file as an attachment to the current IM conversation. " +
		"Use for delivering generated artifacts (image / pdf / zip / etc.) to the user. " +
		"Counts as one outbound message against the per-peer quota.";
	const description = loadToolDescription("im-send-attachment", fallbackDescription);

	return {
		name: "im_send_attachment",
		label: "Send IM Attachment",
		scope_use: ["im-claw"],
		category: "im",
		description,
		parameters: imSendAttachmentSchema,
		execute: async (_toolCallId, params) => {
			if (!params.path || !params.path.startsWith("/")) {
				throw new Error(`im_send_attachment: path must be absolute, got ${JSON.stringify(params.path)}`);
			}
			if (!existsSync(params.path)) {
				throw new Error(`im_send_attachment: file not found: ${params.path}`);
			}
			const st = statSync(params.path);
			if (!st.isFile()) {
				throw new Error(`im_send_attachment: not a regular file: ${params.path}`);
			}

			const result = await bridge.sendAttachment({
				path: params.path,
				kind: params.kind,
				caption: params.caption,
			});

			const detail: ImSendAttachmentToolDetails = {
				messageId: result.messageId,
				kind: params.kind,
				path: params.path,
			};
			const summary =
				`Sent ${params.kind} attachment ${params.path}` +
				(result.messageId ? ` (messageId=${result.messageId})` : "");
			return {
				content: [{ type: "text", text: summary }],
				details: detail,
			};
		},
	};
}
