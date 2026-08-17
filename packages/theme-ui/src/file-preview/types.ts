export type FilePreviewKind = "image" | "file";

export interface FilePreviewItem {
	name: string;
	url?: string;
	path?: string;
	kind?: FilePreviewKind;
	mime?: string;
	size?: number;
}

export interface FilePreviewContext {
	items: FilePreviewItem[];
	index: number;
}

export const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "ico"]);
export const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "ogg", "flac", "m4a", "aac", "opus", "webm"]);
export const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "ogv", "mov", "m4v"]);

export function getExtension(name: string): string {
	const dotIdx = name.lastIndexOf(".");
	if (dotIdx <= 0) return "";
	return name.substring(dotIdx + 1).toLowerCase();
}

export function getPreviewLabel(item: FilePreviewItem): string {
	return item.name;
}
