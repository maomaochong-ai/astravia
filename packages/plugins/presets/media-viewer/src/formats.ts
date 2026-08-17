export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "ico"];

export const AUDIO_EXTENSIONS = ["mp3", "wav", "ogg", "flac", "m4a", "aac", "opus", "webm"];

export const VIDEO_EXTENSIONS = ["mp4", "webm", "ogv", "mov", "m4v"];

export const MEDIA_EXTENSIONS = Array.from(
	new Set([...IMAGE_EXTENSIONS, ...AUDIO_EXTENSIONS, ...VIDEO_EXTENSIONS]),
);

export function isImageExtension(ext: string): boolean {
	return IMAGE_EXTENSIONS.includes(ext);
}

export function isAudioExtension(ext: string): boolean {
	return AUDIO_EXTENSIONS.includes(ext);
}

export function isVideoExtension(ext: string): boolean {
	return VIDEO_EXTENSIONS.includes(ext);
}
