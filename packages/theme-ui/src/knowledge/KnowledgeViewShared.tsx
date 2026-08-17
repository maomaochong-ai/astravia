import { motion } from "motion/react";
import type { JSX } from "react";
import { cn } from "./cn";
import type { KnowledgeProcessStatus, KnowledgeViewNode } from "./types";

export type { KnowledgeProcessStatus, KnowledgeViewNode } from "./types";
export { formatFileSize, knowledgeDirItemCount } from "./types";

/** Shared interaction contract for grid / list file views. */
export interface KnowledgeViewProps {
	nodes: KnowledgeViewNode[];
	searching: boolean;
	selectedIds: Set<string>;
	statusFor: (node: KnowledgeViewNode) => KnowledgeProcessStatus | null;
	onItemClick: (node: KnowledgeViewNode, event: React.MouseEvent) => void;
	onOpen: (node: KnowledgeViewNode) => void;
	onContextMenu: (node: KnowledgeViewNode, event: React.MouseEvent) => void;
	onSelectIds: (ids: Set<string>) => void;
	onClearSelection: () => void;
	labels: KnowledgeViewLabels;
}

export interface KnowledgeViewLabels {
	badgeFailed: string;
	badgeStale: string;
	badgeUnprocessed: string;
	emptySearchTitle: string;
	emptySearchDesc: string;
	emptyDirTitle: string;
	emptyDirDesc: string;
	itemCount: (n: number) => string;
}

export function StatusBadge({
	status,
	labels,
}: {
	status: KnowledgeProcessStatus;
	labels: Pick<KnowledgeViewLabels, "badgeFailed" | "badgeStale" | "badgeUnprocessed">;
}): JSX.Element {
	const config =
		status === "failed"
			? { icon: "icon-[mdi--alert-circle-outline]", title: labels.badgeFailed, tone: "bg-red-500 text-white" }
			: status === "stale"
				? { icon: "icon-[mdi--sync-alert]", title: labels.badgeStale, tone: "bg-amber-500 text-white" }
				: {
						icon: "icon-[mdi--timer-sand]",
						title: labels.badgeUnprocessed,
						tone: "bg-muted-foreground/70 text-white",
					};
	return (
		<span
			title={config.title}
			className={cn(
				"absolute right-0 bottom-0 flex h-4 w-4 items-center justify-center rounded-full shadow-sm ring-2 ring-background",
				config.tone,
			)}
		>
			<span className={cn(config.icon, "h-2.5 w-2.5")} />
		</span>
	);
}

const EMPTY_EASE = [0.22, 1, 0.36, 1] as const;

export function KnowledgeEmptyState({
	searching,
	labels,
}: {
	searching: boolean;
	labels: Pick<
		KnowledgeViewLabels,
		"emptySearchTitle" | "emptySearchDesc" | "emptyDirTitle" | "emptyDirDesc"
	>;
}): JSX.Element {
	return (
		<div className="flex h-full items-center justify-center px-8 py-10">
			<motion.div
				initial={{ opacity: 0, y: 8 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.4, ease: EMPTY_EASE }}
				className="flex max-w-xs flex-col items-center text-center"
			>
				<div className="relative mb-5 flex h-16 w-16 items-center justify-center">
					<span className="absolute inset-0 rounded-3xl bg-muted/40" />
					<span className="absolute inset-1.5 rounded-2xl bg-background/60 ring-1 ring-inset ring-border/50" />
					<span
						className={cn(
							"relative h-7 w-7 text-muted-foreground/40",
							searching ? "icon-[mdi--magnify]" : "icon-[mdi--folder-open-outline]",
						)}
					/>
				</div>
				<p className="text-[13px] font-medium text-foreground/80">
					{searching ? labels.emptySearchTitle : labels.emptyDirTitle}
				</p>
				<p className="mt-1.5 text-[11px] leading-5 text-muted-foreground/50">
					{searching ? labels.emptySearchDesc : labels.emptyDirDesc}
				</p>
			</motion.div>
		</div>
	);
}
