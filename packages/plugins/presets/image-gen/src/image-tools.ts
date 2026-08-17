import type { PluginContext, PluginImageRef } from "@astravia-org/plugin-sdk";
import { editImage, generateImage } from "./image-provider";
import type { ImageRepository } from "./image-repository";

interface GenerateImageInput {
	description?: string;
	prompt: string;
	size?: string;
}

interface EditImageInput extends GenerateImageInput {
	sourceImageId?: string;
	sourceImagePath?: string;
}

const PREVIEW_CARD_TYPE = "image-gen:preview";
const IMAGE_REFS_OPEN = "<astravia-images>";
const IMAGE_REFS_CLOSE = "</astravia-images>";
const SCOPE_USE = ["im-claw", "conversation", "project", "cli"] as const;
const HISTORY_TAB_ID = "history";

const sizeSchema = {
	type: "string",
	description:
		"Output dimensions as WIDTHxHEIGHT. Choose a size matching the requested aspect ratio; omit for 1024x1024.",
};

const generateParameters = {
	type: "object",
	properties: {
		description: { type: "string", description: "Short description of this tool call." },
		prompt: {
			type: "string",
			description:
				"Detailed English image prompt including subject, style, lighting, and composition.",
		},
		size: sizeSchema,
	},
	required: ["prompt"],
	additionalProperties: false,
};

const editParameters = {
	type: "object",
	properties: {
		description: { type: "string", description: "Short description of this tool call." },
		prompt: {
			type: "string",
			description: "Clear English instruction describing only the requested source-image changes.",
		},
		sourceImageId: {
			type: "string",
			description:
				`Generated image id from the latest ${IMAGE_REFS_OPEN} marker or the attached edit target.`,
		},
		sourceImagePath: {
			type: "string",
			description:
				"Absolute local image path. Use this instead of sourceImageId for uploaded or attached files.",
		},
		size: sizeSchema,
	},
	required: ["prompt"],
	additionalProperties: false,
};

function cards(images: PluginImageRef[]): unknown[] {
	if (images.length === 0) return [];
	return [
		{
			type: PREVIEW_CARD_TYPE,
			key: images[0]?.rootId,
			payload: { images },
		},
	];
}

function result(kind: "generated" | "edited", images: PluginImageRef[]): Record<string, unknown> {
	const marker =
		images.length > 0
			? `${IMAGE_REFS_OPEN}${JSON.stringify(images)}${IMAGE_REFS_CLOSE}`
			: "";
	return {
		ok: images.length > 0,
		summary:
			kind === "generated"
				? `Generated ${images.length} image(s). ${marker}`
				: `Edited ${images.length} image(s). ${marker}`,
		images,
		cards: cards(images),
	};
}

export function registerImageTools(ctx: PluginContext, repository: ImageRepository): void {
	ctx.agent.registerTool<GenerateImageInput>({
		id: "generate-image",
		name: "generate_image",
		label: "%tool.generate_image%",
		description:
			"Generate an actual new image from text. Use only when the user wants an image produced, then optimize the request into a detailed prompt.",
		parameters: generateParameters,
		timeoutMs: 300_000,
		scope_use: SCOPE_USE,
		handler: async ({ session, trigger }) => {
			const bytes = await generateImage(ctx.network, ctx.settings, trigger.input);
			const image = await repository.persist(bytes, { sessionId: session.id });
			ctx.ui.openActivityTab(HISTORY_TAB_ID);
			return result("generated", [image]);
		},
	});

	ctx.agent.registerTool<EditImageInput>({
		id: "edit-image",
		name: "edit_image",
		label: "%tool.edit_image%",
		description:
			"Edit a specific existing image. Use sourceImageId for a previously generated image or sourceImagePath for a local file, never both.",
		parameters: editParameters,
		timeoutMs: 300_000,
		scope_use: SCOPE_USE,
		handler: async ({ host, session, trigger }) => {
			const input = trigger.input;
			if (!input.sourceImageId && !input.sourceImagePath) {
				return {
					ok: false,
					retryable: true,
					error: "Provide sourceImageId or sourceImagePath.",
				};
			}
			if (input.sourceImageId && input.sourceImagePath) {
				return {
					ok: false,
					retryable: true,
					error: "Provide exactly one image source.",
				};
			}
			const generatedSource = input.sourceImageId
				? await repository.read(input.sourceImageId)
				: null;
			const localSource = input.sourceImagePath
				? await host.fs.readBinaryFile(input.sourceImagePath)
				: null;
			const source = generatedSource ??
				(localSource
					? {
							data: localSource.data,
							mimeType: localSource.mimeType,
						}
					: null);
			if (!source) throw new Error("Image source was not found");
			const bytes = await editImage(ctx.network, ctx.settings, {
				prompt: input.prompt,
				source,
				size: input.size,
			});
			const sourceLineage = input.sourceImageId
				? await repository.lineage(input.sourceImageId)
				: [];
			const rootId = sourceLineage[0]?.rootId;
			const image = await repository.persist(bytes, {
				rootId,
				parent: input.sourceImageId,
				sessionId: session.id,
			});
			ctx.ui.openActivityTab(HISTORY_TAB_ID);
			return result("edited", [image]);
		},
	});
}
