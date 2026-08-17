export type KnowledgeProcessStatus = "unprocessed" | "processed" | "stale" | "failed";

/** Minimal node shape for grid/list presentation (host maps domain types). */
export interface KnowledgeViewNode {
	readonly id: string;
	readonly name: string;
	readonly type: "file" | "directory";
	readonly size?: number;
	readonly childCount?: number;
	readonly children?: readonly unknown[];
}

export function knowledgeDirItemCount(node: KnowledgeViewNode): number {
	if (node.type !== "directory") return 0;
	if (node.childCount !== undefined) return node.childCount;
	return node.children?.length ?? 0;
}

/** File size: B / KB / MB / GB. Directories without size return empty string. */
export function formatFileSize(bytes: number | undefined): string {
	if (bytes === undefined) return "";
	if (bytes < 1024) return `${bytes} B`;
	const units = ["KB", "MB", "GB"];
	let value = bytes / 1024;
	let unit = units[0];
	for (let i = 1; i < units.length && value >= 1024; i++) {
		value /= 1024;
		unit = units[i];
	}
	return `${value >= 10 ? value.toFixed(1) : value.toFixed(2)} ${unit}`;
}
