import type { JSX } from "react";

export interface KnowledgeHistorySessionItem {
	path: string;
	/** Pre-formatted time label (host owns locale). */
	label: string;
	active: boolean;
}

export interface KnowledgeHistoryPanelViewLabels {
	loading: string;
	empty: string;
	clear: string;
	loadAll: string;
}

export interface KnowledgeHistoryPanelViewProps {
	loading: boolean;
	sessions: readonly KnowledgeHistorySessionItem[];
	hasMore: boolean;
	clearing: boolean;
	labels: KnowledgeHistoryPanelViewLabels;
	onOpen: (path: string) => void;
	onClearRequest: () => void;
	onExpand: () => void;
}

export function KnowledgeHistoryPanelView({
	loading,
	sessions,
	hasMore,
	clearing,
	labels,
	onOpen,
	onClearRequest,
	onExpand,
}: KnowledgeHistoryPanelViewProps): JSX.Element {
	if (loading) {
		return (
			<div className="flex items-center justify-center py-8 text-[12px] text-muted-foreground/50">
				<span className="icon-[mdi--loading] mr-1.5 h-3.5 w-3.5 animate-spin" />
				{labels.loading}
			</div>
		);
	}
	if (sessions.length === 0 && !hasMore) {
		return (
			<div className="py-8 text-center text-[12px] text-muted-foreground/50">{labels.empty}</div>
		);
	}

	return (
		<div className="flex h-full flex-col overflow-hidden">
			<div className="flex items-center justify-end px-2 pt-2">
				<button
					type="button"
					onClick={onClearRequest}
					disabled={clearing}
					className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
				>
					<span
						className={`h-3.5 w-3.5 ${clearing ? "icon-[mdi--loading] animate-spin" : "icon-[mdi--delete-sweep-outline]"}`}
					/>
					{labels.clear}
				</button>
			</div>
			<div className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2 pt-1">
				{sessions.map((s) => (
					<button
						key={s.path}
						type="button"
						onClick={() => onOpen(s.path)}
						className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] transition-colors ${
							s.active ? "bg-primary/10 text-primary" : "text-foreground hover:bg-accent/50"
						}`}
					>
						<span className="icon-[mdi--history] h-3.5 w-3.5 shrink-0 opacity-60" />
						<span className="truncate">{s.label}</span>
					</button>
				))}
				{hasMore && (
					<button
						type="button"
						onClick={onExpand}
						className="mt-1 rounded-lg px-2.5 py-1.5 text-center text-[12px] text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
					>
						{labels.loadAll}
					</button>
				)}
			</div>
		</div>
	);
}
