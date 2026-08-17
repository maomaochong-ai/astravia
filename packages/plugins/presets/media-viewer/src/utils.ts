export function cn(...parts: Array<string | false | null | undefined>): string {
	return parts.filter(Boolean).join(" ");
}

export function versionedUrl(url: string, version: number): string {
	if (version === 0) return url;
	return `${url}${url.includes("?") ? "&" : "?"}v=${version}`;
}

export function formatTime(sec: number): string {
	if (!Number.isFinite(sec) || sec < 0) return "0:00";
	const m = Math.floor(sec / 60);
	const s = Math.floor(sec % 60);
	return `${m}:${s.toString().padStart(2, "0")}`;
}
