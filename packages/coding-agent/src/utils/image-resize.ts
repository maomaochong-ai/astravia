import type { ImageContent } from "@astravia/ai";
import { loadPhoton } from "./photon.js";

let warnedNoPhoton = false;
const DEBUG_RESIZE = process.env.DEBUG_IMAGE_RESIZE === "1" || process.env.DEBUG_IMAGE_RESIZE === "true";

export interface ImageResizeOptions {
	maxWidth?: number; // Default: 1280
	maxHeight?: number; // Default: 1280
	maxInputPixels?: number; // Default: 8000 * 8000
	maxInputEdge?: number; // Default: 12000
	maxBytes?: number; // Default: 2MB
	jpegQuality?: number; // Default: 70
}

export interface ResizedImage {
	data: string; // base64
	mimeType: string;
	originalWidth: number;
	originalHeight: number;
	width: number;
	height: number;
	wasResized: boolean;
}

export interface ImageResizeFailure {
	failed: true;
	mimeType: string;
	originalSizeBytes: number;
	reason: "processor_unavailable" | "processing_failed" | "input_too_large";
	message: string;
}

export type ImageResizeResult = ResizedImage | ImageResizeFailure;

// 2MB - conservative default tuned for local/open-source VL models whose
// GPU memory budget is dominated by visual token count rather than raw bytes.
// Anthropic Claude tolerates up to 5MB; if you exclusively target Claude you
// can raise this via ReadToolOptions.
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;

const DEFAULT_OPTIONS: Required<ImageResizeOptions> = {
	maxWidth: 1280,
	maxHeight: 1280,
	maxInputPixels: 8000 * 8000,
	maxInputEdge: 12000,
	maxBytes: DEFAULT_MAX_BYTES,
	jpegQuality: 70,
};

interface ImageDimensions {
	width: number;
	height: number;
}

interface InputDimensionLimitDetails {
	width: number;
	height: number;
	pixels: number;
	maxInputPixels: number;
	maxInputEdge: number;
}

/** Helper to pick the smaller of two buffers */
function pickSmaller(
	a: { buffer: Uint8Array; mimeType: string },
	b: { buffer: Uint8Array; mimeType: string },
): { buffer: Uint8Array; mimeType: string } {
	return a.buffer.length <= b.buffer.length ? a : b;
}

function debugLog(result: ResizedImage, originalBytes: number): ResizedImage {
	if (DEBUG_RESIZE) {
		const finalBytes = Math.round((result.data.length * 3) / 4);
		console.warn(
			`[image-resize] ${result.originalWidth}x${result.originalHeight} (${originalBytes}B) → ${result.width}x${result.height} (~${finalBytes}B ${result.mimeType}) wasResized=${result.wasResized}`,
		);
	}
	return result;
}

export function isImageResizeFailure(result: ImageResizeResult): result is ImageResizeFailure {
	return "failed" in result;
}

function formatBytes(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes < 0) return "unknown size";
	const units = ["B", "KB", "MB", "GB"];
	let value = bytes;
	let unitIndex = 0;
	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex++;
	}
	return unitIndex === 0 ? `${bytes} ${units[unitIndex]}` : `${value.toFixed(1)} ${units[unitIndex]}`;
}

function describeError(err: unknown): string {
	if (err instanceof Error) {
		return [err.name, err.message, err.stack].filter(Boolean).join(": ");
	}
	return String(err);
}

function createFailure(
	inputBuffer: Buffer,
	mimeType: string,
	reason: ImageResizeFailure["reason"],
	message: string,
): ImageResizeFailure {
	return {
		failed: true,
		mimeType,
		originalSizeBytes: inputBuffer.length,
		reason,
		message,
	};
}

export function formatImageResizeFailureNote(result: ImageResizeFailure, label = "image"): string {
	return `[Image omitted: ${label} was not sent to the model. ${result.message} Original: ${result.mimeType}, ${formatBytes(result.originalSizeBytes)}.]`;
}

function createInputTooLargeMessage(details: InputDimensionLimitDetails): string {
	return `The image is ${details.width}x${details.height} (${details.pixels} pixels), which exceeds the safe local processing limit of ${details.maxInputPixels} pixels or ${details.maxInputEdge}px on either edge.`;
}

function readUint24LE(buffer: Buffer, offset: number): number {
	return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
}

function getPngDimensions(buffer: Buffer): ImageDimensions | undefined {
	if (
		buffer.length < 24 ||
		buffer[0] !== 0x89 ||
		buffer[1] !== 0x50 ||
		buffer[2] !== 0x4e ||
		buffer[3] !== 0x47 ||
		buffer[12] !== 0x49 ||
		buffer[13] !== 0x48 ||
		buffer[14] !== 0x44 ||
		buffer[15] !== 0x52
	) {
		return undefined;
	}
	return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function getGifDimensions(buffer: Buffer): ImageDimensions | undefined {
	if (
		buffer.length < 10 ||
		buffer[0] !== 0x47 ||
		buffer[1] !== 0x49 ||
		buffer[2] !== 0x46 ||
		buffer[3] !== 0x38 ||
		(buffer[4] !== 0x37 && buffer[4] !== 0x39) ||
		buffer[5] !== 0x61
	) {
		return undefined;
	}
	return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
}

function getJpegDimensions(buffer: Buffer): ImageDimensions | undefined {
	if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
		return undefined;
	}

	let offset = 2;
	while (offset + 3 < buffer.length) {
		if (buffer[offset] !== 0xff) {
			offset++;
			continue;
		}

		while (offset < buffer.length && buffer[offset] === 0xff) {
			offset++;
		}

		const marker = buffer[offset];
		offset++;

		if (marker === 0xd8 || marker === 0xd9) {
			continue;
		}
		if (marker >= 0xd0 && marker <= 0xd7) {
			continue;
		}
		if (offset + 1 >= buffer.length) {
			return undefined;
		}

		const segmentLength = buffer.readUInt16BE(offset);
		if (segmentLength < 2 || offset + segmentLength > buffer.length) {
			return undefined;
		}

		const isStartOfFrame =
			(marker >= 0xc0 && marker <= 0xc3) ||
			(marker >= 0xc5 && marker <= 0xc7) ||
			(marker >= 0xc9 && marker <= 0xcb) ||
			(marker >= 0xcd && marker <= 0xcf);

		if (isStartOfFrame) {
			if (segmentLength < 7) {
				return undefined;
			}
			return {
				height: buffer.readUInt16BE(offset + 3),
				width: buffer.readUInt16BE(offset + 5),
			};
		}

		offset += segmentLength;
	}

	return undefined;
}

function getWebpDimensions(buffer: Buffer): ImageDimensions | undefined {
	if (buffer.length < 30 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") {
		return undefined;
	}

	let offset = 12;
	while (offset + 8 <= buffer.length) {
		const chunkType = buffer.toString("ascii", offset, offset + 4);
		const chunkSize = buffer.readUInt32LE(offset + 4);
		const dataOffset = offset + 8;
		if (dataOffset + chunkSize > buffer.length) {
			return undefined;
		}

		if (chunkType === "VP8X" && chunkSize >= 10) {
			return {
				width: readUint24LE(buffer, dataOffset + 4) + 1,
				height: readUint24LE(buffer, dataOffset + 7) + 1,
			};
		}

		if (chunkType === "VP8 " && chunkSize >= 10) {
			if (buffer[dataOffset + 3] !== 0x9d || buffer[dataOffset + 4] !== 0x01 || buffer[dataOffset + 5] !== 0x2a) {
				return undefined;
			}
			return {
				width: buffer.readUInt16LE(dataOffset + 6) & 0x3fff,
				height: buffer.readUInt16LE(dataOffset + 8) & 0x3fff,
			};
		}

		if (chunkType === "VP8L" && chunkSize >= 5) {
			if (buffer[dataOffset] !== 0x2f) {
				return undefined;
			}
			const b1 = buffer[dataOffset + 1];
			const b2 = buffer[dataOffset + 2];
			const b3 = buffer[dataOffset + 3];
			const b4 = buffer[dataOffset + 4];
			return {
				width: 1 + (((b2 & 0x3f) << 8) | b1),
				height: 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6)),
			};
		}

		offset = dataOffset + chunkSize + (chunkSize % 2);
	}

	return undefined;
}

function getImageDimensions(buffer: Buffer, mimeType: string): ImageDimensions | undefined {
	switch (mimeType) {
		case "image/png":
			return getPngDimensions(buffer);
		case "image/jpeg":
		case "image/jpg":
			return getJpegDimensions(buffer);
		case "image/gif":
			return getGifDimensions(buffer);
		case "image/webp":
			return getWebpDimensions(buffer);
		default:
			return undefined;
	}
}

function validateInputDimensions(
	inputBuffer: Buffer,
	mimeType: string,
	opts: Required<ImageResizeOptions>,
): ImageResizeFailure | undefined {
	let dimensions: ImageDimensions | undefined;
	try {
		dimensions = getImageDimensions(inputBuffer, mimeType);
	} catch (err) {
		console.warn(
			`[image-resize] Failed to read image metadata before Photon decode (${inputBuffer.length} bytes, ${mimeType}); continuing with Photon decode. Error: ${describeError(err)}`,
		);
		return undefined;
	}

	if (!dimensions) {
		return undefined;
	}

	const { width, height } = dimensions;
	const pixels = width * height;
	const maxEdge = Math.max(width, height);

	if (pixels > opts.maxInputPixels || maxEdge > opts.maxInputEdge) {
		const details = {
			width,
			height,
			pixels,
			maxInputPixels: opts.maxInputPixels,
			maxInputEdge: opts.maxInputEdge,
		};
		console.warn(
			`[image-resize] Skipping image before Photon decode (${inputBuffer.length} bytes, ${mimeType}); ${createInputTooLargeMessage(details)}`,
		);
		return createFailure(inputBuffer, mimeType, "input_too_large", createInputTooLargeMessage(details));
	}

	return undefined;
}

function asBuffer(bytes: Buffer | Uint8Array): Buffer {
	if (Buffer.isBuffer(bytes)) {
		return bytes;
	}
	return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/**
 * Resize an image to fit within the specified max dimensions and file size.
 * Returns the original image if it already fits within the limits.
 *
 * Uses Photon (Rust/WASM) for image processing. If Photon is not available or
 * processing fails, returns a failure result instead of forwarding the original
 * image to the model.
 *
 * Strategy for staying under maxBytes:
 * 1. First resize to maxWidth/maxHeight
 * 2. Try both PNG and JPEG formats, pick the smaller one
 * 3. If still too large, try JPEG with decreasing quality
 * 4. If still too large, progressively reduce dimensions
 */
export async function resizeImage(img: ImageContent, options?: ImageResizeOptions): Promise<ImageResizeResult> {
	const inputBuffer = Buffer.from(img.data, "base64");
	return resizeImageBuffer(inputBuffer, img.mimeType, options, img.data);
}

export async function resizeImageBuffer(
	bytes: Buffer | Uint8Array,
	mimeType: string,
	options?: ImageResizeOptions,
	originalBase64?: string,
): Promise<ImageResizeResult> {
	const opts = { ...DEFAULT_OPTIONS, ...options };
	const inputBuffer = asBuffer(bytes);

	const inputDimensionFailure = validateInputDimensions(inputBuffer, mimeType, opts);
	if (inputDimensionFailure) {
		return inputDimensionFailure;
	}

	const photon = await loadPhoton();
	if (!photon) {
		if (!warnedNoPhoton) {
			warnedNoPhoton = true;
			console.warn(
				`[image-resize] Skipping image: Photon unavailable. Image (${inputBuffer.length} bytes, ${mimeType}) will be omitted instead of being sent at original resolution.`,
			);
		}
		return createFailure(
			inputBuffer,
			mimeType,
			"processor_unavailable",
			"The image could not be prepared for model input because image processing is currently unavailable.",
		);
	}

	let image: ReturnType<typeof photon.PhotonImage.new_from_byteslice> | undefined;
	try {
		image = photon.PhotonImage.new_from_byteslice(new Uint8Array(inputBuffer));

		const originalWidth = image.get_width();
		const originalHeight = image.get_height();
		const format = mimeType?.split("/")[1] ?? "png";

		// Check if already within all limits (dimensions AND size)
		const originalSize = inputBuffer.length;
		if (originalWidth <= opts.maxWidth && originalHeight <= opts.maxHeight && originalSize <= opts.maxBytes) {
			return debugLog(
				{
					data: originalBase64 ?? inputBuffer.toString("base64"),
					mimeType: mimeType ?? `image/${format}`,
					originalWidth,
					originalHeight,
					width: originalWidth,
					height: originalHeight,
					wasResized: false,
				},
				inputBuffer.length,
			);
		}

		// Calculate initial dimensions respecting max limits
		let targetWidth = originalWidth;
		let targetHeight = originalHeight;

		if (targetWidth > opts.maxWidth) {
			targetHeight = Math.round((targetHeight * opts.maxWidth) / targetWidth);
			targetWidth = opts.maxWidth;
		}
		if (targetHeight > opts.maxHeight) {
			targetWidth = Math.round((targetWidth * opts.maxHeight) / targetHeight);
			targetHeight = opts.maxHeight;
		}

		// Helper to resize and encode in both formats, returning the smaller one
		function tryBothFormats(
			width: number,
			height: number,
			jpegQuality: number,
		): { buffer: Uint8Array; mimeType: string } {
			const resized = photon!.resize(image!, width, height, photon!.SamplingFilter.Lanczos3);

			try {
				const pngBuffer = resized.get_bytes();
				const jpegBuffer = resized.get_bytes_jpeg(jpegQuality);

				return pickSmaller(
					{ buffer: pngBuffer, mimeType: "image/png" },
					{ buffer: jpegBuffer, mimeType: "image/jpeg" },
				);
			} finally {
				resized.free();
			}
		}

		// Try to produce an image under maxBytes
		const qualitySteps = [85, 70, 55, 40];
		const scaleSteps = [1.0, 0.75, 0.5, 0.35, 0.25];

		let best: { buffer: Uint8Array; mimeType: string };
		let finalWidth = targetWidth;
		let finalHeight = targetHeight;

		// First attempt: resize to target dimensions, try both formats
		best = tryBothFormats(targetWidth, targetHeight, opts.jpegQuality);

		if (best.buffer.length <= opts.maxBytes) {
			return debugLog(
				{
					data: Buffer.from(best.buffer).toString("base64"),
					mimeType: best.mimeType,
					originalWidth,
					originalHeight,
					width: finalWidth,
					height: finalHeight,
					wasResized: true,
				},
				inputBuffer.length,
			);
		}

		// Still too large - try JPEG with decreasing quality
		for (const quality of qualitySteps) {
			best = tryBothFormats(targetWidth, targetHeight, quality);

			if (best.buffer.length <= opts.maxBytes) {
				return debugLog(
					{
						data: Buffer.from(best.buffer).toString("base64"),
						mimeType: best.mimeType,
						originalWidth,
						originalHeight,
						width: finalWidth,
						height: finalHeight,
						wasResized: true,
					},
					inputBuffer.length,
				);
			}
		}

		// Still too large - reduce dimensions progressively
		for (const scale of scaleSteps) {
			finalWidth = Math.round(targetWidth * scale);
			finalHeight = Math.round(targetHeight * scale);

			if (finalWidth < 100 || finalHeight < 100) {
				break;
			}

			for (const quality of qualitySteps) {
				best = tryBothFormats(finalWidth, finalHeight, quality);

				if (best.buffer.length <= opts.maxBytes) {
					return debugLog(
						{
							data: Buffer.from(best.buffer).toString("base64"),
							mimeType: best.mimeType,
							originalWidth,
							originalHeight,
							width: finalWidth,
							height: finalHeight,
							wasResized: true,
						},
						inputBuffer.length,
					);
				}
			}
		}

		// Last resort: return smallest version we produced
		return debugLog(
			{
				data: Buffer.from(best.buffer).toString("base64"),
				mimeType: best.mimeType,
				originalWidth,
				originalHeight,
				width: finalWidth,
				height: finalHeight,
				wasResized: true,
			},
			inputBuffer.length,
		);
	} catch (err) {
		const detail = describeError(err);
		console.warn(
			`[image-resize] Resize failed (${inputBuffer.length} bytes, ${mimeType}); image omitted instead of passing through at ORIGINAL resolution. Error: ${detail}`,
		);
		return createFailure(
			inputBuffer,
			mimeType,
			"processing_failed",
			"The image could not be decoded or resized into a safe model-sized image.",
		);
	} finally {
		if (image) {
			image.free();
		}
	}
}

/**
 * Format a dimension note for resized images.
 * This helps the model understand the coordinate mapping.
 */
export function formatDimensionNote(result: ResizedImage): string | undefined {
	if (!result.wasResized) {
		return undefined;
	}

	const scale = result.originalWidth / result.width;
	return `[Image: original ${result.originalWidth}x${result.originalHeight}, displayed at ${result.width}x${result.height}. Multiply coordinates by ${scale.toFixed(2)} to map to original image.]`;
}
