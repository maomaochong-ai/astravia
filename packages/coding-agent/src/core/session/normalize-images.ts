/**
 * Normalize user-attached images through the resize pipeline.
 *
 * Extracted from AgentSession. Pure function: the autoResize toggle is passed in.
 */

import type { ImageContent } from "@astravia/ai";
import { formatImageResizeFailureNote, isImageResizeFailure, resizeImage } from "../../utils/image-resize.js";

/**
 * Run user-attached images (paste / drag / desktop attach) through the same
 * resize pipeline the `read` tool uses. When autoResize is disabled, returns
 * the input unchanged.
 */
export async function normalizeUserImages(
	images: ImageContent[] | undefined,
	autoResize: boolean,
): Promise<{ images: ImageContent[] | undefined; notes: string[] }> {
	if (!images || images.length === 0) return { images, notes: [] };
	if (!autoResize) return { images, notes: [] };

	const out: ImageContent[] = [];
	const notes: string[] = [];
	for (const [index, img] of images.entries()) {
		try {
			const resized = await resizeImage(img);
			if (isImageResizeFailure(resized)) {
				notes.push(formatImageResizeFailureNote(resized, `attached image ${index + 1}`));
				continue;
			}
			out.push({ type: "image", data: resized.data, mimeType: resized.mimeType });
		} catch (error) {
			console.warn(
				`[image-resize] Unexpected user attachment resize error; image omitted. Error: ${
					error instanceof Error ? error.stack || error.message : String(error)
				}`,
			);
			notes.push(
				`[Image omitted: attached image ${index + 1} was not sent to the model because image processing failed unexpectedly. Check the application logs for the detailed processing error.]`,
			);
		}
	}
	return { images: out.length > 0 ? out : undefined, notes };
}
