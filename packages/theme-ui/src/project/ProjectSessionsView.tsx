import { AnimatePresence, motion } from "motion/react";
import { useRef, type JSX, type ReactNode } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { ShowMoreSessionsButton } from "../sidebar/ShowMoreSessionsButton";
import { ProjectSessionsLoadingView } from "./ProjectSessionsLoadingView";
import {
	VIRTUAL_SESSION_OVERSCAN,
	VIRTUAL_SESSION_ROW_HEIGHT,
} from "./types";
import { useActiveSessionAutoScroll } from "./useActiveSessionAutoScroll";

export interface ProjectSessionsViewItem {
	active?: boolean;
	key: string;
}

export interface ProjectSessionsViewLabels {
	collapse: string;
	expand: string;
}

export interface ProjectSessionsViewProps<T extends ProjectSessionsViewItem> {
	empty: ReactNode;
	expanded: boolean;
	hasMore: boolean;
	loading?: boolean;
	labels: ProjectSessionsViewLabels;
	onToggleShowAll: () => void;
	/** Scroll parent for Virtuoso when showAll. */
	scrollParent: HTMLElement | null;
	sessions: readonly T[];
	showAll: boolean;
	renderSession: (session: T) => ReactNode;
}

export function ProjectSessionsView<T extends ProjectSessionsViewItem>({
	empty,
	expanded,
	hasMore,
	loading = false,
	labels,
	onToggleShowAll,
	scrollParent,
	sessions,
	showAll,
	renderSession,
}: ProjectSessionsViewProps<T>): JSX.Element {
	const useVirtual = showAll && sessions.length > 0 && scrollParent != null;
	const virtuosoRef = useRef<VirtuosoHandle>(null);
	const activeIndex = sessions.findIndex((session) => session.active);
	const activeKey = activeIndex >= 0 ? sessions[activeIndex]?.key : undefined;
	useActiveSessionAutoScroll({ activeIndex, activeKey, enabled: expanded, scrollParent, virtuosoRef });

	return (
		<AnimatePresence initial={false}>
			{expanded && (
				<motion.div
					key="sessions"
					initial={{ height: 0, opacity: 0 }}
					animate={{ height: "auto", opacity: 1 }}
					exit={{ height: 0, opacity: 0 }}
					transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
					style={{ overflow: "hidden" }}
				>
					<div className="mt-px space-y-px">
						{loading ? (
							<ProjectSessionsLoadingView />
						) : sessions.length === 0 ? (
							empty
						) : useVirtual ? (
							<Virtuoso
								ref={virtuosoRef}
								customScrollParent={scrollParent}
								data={sessions as T[]}
								defaultItemHeight={VIRTUAL_SESSION_ROW_HEIGHT}
								overscan={VIRTUAL_SESSION_OVERSCAN}
								itemContent={(_, session) => (
									<div className="pb-px">{renderSession(session)}</div>
								)}
							/>
						) : (
							sessions.map((session) => renderSession(session))
						)}
						{hasMore && (
							<ShowMoreSessionsButton
								labels={labels}
								onClick={onToggleShowAll}
								showAll={showAll}
							/>
						)}
					</div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
