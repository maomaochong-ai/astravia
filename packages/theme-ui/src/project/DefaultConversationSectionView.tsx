import { cn } from "@astravia/ui";
import type { JSX, ReactNode } from "react";
import { ScrollFade } from "../shared/ScrollFade";
import { QuickScrollOverlay, type QuickScrollLabels } from "./QuickScrollOverlay";

export interface DefaultConversationSectionViewLabels {
	more: string;
	newSession: string;
}

export interface DefaultConversationSectionViewProps {
	className?: string;
	filterSelect: ReactNode;
	labels: DefaultConversationSectionViewLabels;
	list: ReactNode;
	listScrollElement: HTMLElement | null;
	onListScrollRef: (el: HTMLDivElement | null) => void;
	onMoreClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
	onNewSession?: () => void;
	onOpenContextMenu: (event: React.MouseEvent) => void;
	quickScrollLabels: QuickScrollLabels;
	showNewSession: boolean;
	/**
	 * When the conversation list is empty, keep header actions visible so users
	 * can discover “new session” without hovering the row.
	 */
	actionsAlwaysVisible?: boolean;
}

export function DefaultConversationSectionView({
	className,
	filterSelect,
	labels,
	list,
	listScrollElement,
	onListScrollRef,
	onMoreClick,
	onNewSession,
	onOpenContextMenu,
	quickScrollLabels,
	showNewSession,
	actionsAlwaysVisible = false,
}: DefaultConversationSectionViewProps): JSX.Element {
	const actionButtonClass = actionsAlwaysVisible
		? "flex items-center justify-center rounded-md p-1.5 text-foreground opacity-70 transition-opacity hover:bg-accent hover:opacity-100"
		: "flex items-center justify-center rounded-md p-1.5 text-foreground opacity-0 transition-opacity hover:bg-accent group-hover:opacity-60 group-hover:hover:opacity-100";

	return (
		<div className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", className)}>
			<div
				className="group -mx-1.5 flex shrink-0 items-center justify-between pb-1 pl-2 pr-1 pt-1"
				onContextMenu={onOpenContextMenu}
			>
				<div className="flex min-w-0 items-center gap-0.5">{filterSelect}</div>
				<div className="flex items-center">
					<button
						type="button"
						title={labels.more}
						onClick={onMoreClick}
						className={actionButtonClass}
					>
						<span className="icon-[solar--menu-dots-linear] h-4 w-4" />
					</button>
					{showNewSession && onNewSession && (
						<button
							type="button"
							title={labels.newSession}
							onClick={onNewSession}
							className={actionButtonClass}
						>
							<span className="icon-[solar--add-square-outline] h-4 w-4" />
						</button>
					)}
				</div>
			</div>
			<QuickScrollOverlay
				labels={quickScrollLabels}
				scrollElement={listScrollElement}
				className="min-h-0 flex-1"
			>
				<ScrollFade
					data-sidebar-selection-scroll="true"
					onScrollRef={onListScrollRef}
					className="min-h-0 flex-1 overflow-y-auto no-scrollbar"
				>
					{list}
				</ScrollFade>
			</QuickScrollOverlay>
		</div>
	);
}
