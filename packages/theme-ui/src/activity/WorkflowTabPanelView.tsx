import type { JSX, ReactNode } from "react";

export interface WorkflowSwitcherItem {
	id: string;
	name: string;
	/** e.g. "1/4"; empty string when the workflow has no todos yet. */
	progressLabel: string;
	statusIcon: string;
	statusClassName: string;
	selected: boolean;
	/** Queued / pending / running — shows the stop affordance on the selected chip. */
	active: boolean;
}

export interface WorkflowTabPanelViewProps {
	items: WorkflowSwitcherItem[];
	emptyLabel: string;
	stopLabel: string;
	/** Shown when the selected workflow has no transcript yet (queued / just started). */
	noTranscriptLabel: string;
	hasTranscript: boolean;
	/** Read-only 1:1 MessageList for the selected workflow (host-supplied). */
	messageList: ReactNode;
	onSelect: (id: string) => void;
	onStop: (id: string) => void;
}

/**
 * Workflow activity tab (ADR-0044): switcher bar on top, read-only
 * MessageList of the selected workflow below.
 */
export function WorkflowTabPanelView({
	items,
	emptyLabel,
	stopLabel,
	noTranscriptLabel,
	hasTranscript,
	messageList,
	onSelect,
	onStop,
}: WorkflowTabPanelViewProps): JSX.Element {
	if (items.length === 0) {
		return (
			<div className="flex min-h-0 flex-1 items-center justify-center text-[12px] text-muted-foreground">
				{emptyLabel}
			</div>
		);
	}
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border/60 px-3 py-2">
				{items.map((item) => (
					<div
						key={item.id}
						className={`flex items-center gap-1 rounded-full border px-2.5 py-1 transition-colors ${
							item.selected
								? "border-primary/40 bg-primary/10 text-foreground"
								: "border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted/60"
						}`}
					>
						<button type="button" onClick={() => onSelect(item.id)} className="flex items-center gap-1.5">
							<span className={`${item.statusIcon} text-[12px] ${item.statusClassName}`} />
							<span className="max-w-[120px] truncate text-[11px] font-medium">{item.name}</span>
							{item.progressLabel && <span className="font-mono text-[10px] opacity-70">{item.progressLabel}</span>}
						</button>
						{item.selected && item.active && (
							<button
								type="button"
								title={stopLabel}
								aria-label={stopLabel}
								onClick={() => onStop(item.id)}
								className="ml-0.5 rounded p-0.5 text-muted-foreground hover:text-destructive"
							>
								<span className="icon-[mdi--stop-circle-outline] text-[12px]" />
							</button>
						)}
					</div>
				))}
			</div>
			{hasTranscript ? (
				<div className="flex min-h-0 flex-1 flex-col overflow-hidden">{messageList}</div>
			) : (
				<div className="flex min-h-0 flex-1 items-center justify-center text-[12px] text-muted-foreground">
					{noTranscriptLabel}
				</div>
			)}
		</div>
	);
}
