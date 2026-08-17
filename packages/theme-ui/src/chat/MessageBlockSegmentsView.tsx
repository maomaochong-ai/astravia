import { AnimatePresence, motion } from "motion/react";
import type { Transition } from "motion/react";
import type { JSX, ReactNode } from "react";
import { memo, useId, useState } from "react";

/** Slide-up + fade for new message segments (not typewriter). */
const SEGMENT_INITIAL = { opacity: 0, y: 16 };
const SEGMENT_ANIMATE = { opacity: 1, y: 0 };
const SEGMENT_TRANSITION = {
	duration: 0.36,
	ease: [0.22, 1, 0.36, 1] as const,
} satisfies Transition;
const COLLAPSE_INITIAL = { height: 0, opacity: 0 };
const COLLAPSE_ANIMATE = { height: "auto", opacity: 1 };
const COLLAPSE_EXIT = { height: 0, opacity: 0 };
const COLLAPSE_TRANSITION = {
	duration: 0.2,
	ease: [0.25, 0.1, 0.25, 1] as const,
} satisfies Transition;

export interface ToolCallGroupViewLabels {
	summary: string;
}

export interface ToolCallGroupViewProps {
	blockCount: number;
	summary: string;
	allDone: boolean;
	exportMode?: boolean;
	/** Force open (e.g. marketing story while tools stream in). */
	forceExpanded?: boolean;
	/** Expanded tool/thinking rows. */
	children: ReactNode;
}

export function ToolCallGroupView({
	blockCount,
	summary,
	allDone,
	exportMode = false,
	forceExpanded = false,
	children,
}: ToolCallGroupViewProps): JSX.Element {
	const [expanded, setExpanded] = useState(forceExpanded);
	const generatedId = useId();
	const panelId = exportMode ? `export-tool-group-${generatedId}` : undefined;
	const open = expanded || exportMode || forceExpanded;

	return (
		<div className="relative w-fit max-w-full overflow-hidden rounded-lg px-1 py-0.5">
			<div className="inline-block max-w-full align-top">
				<button
					type="button"
					onClick={() => setExpanded(!expanded)}
					data-export-toggle={panelId}
					aria-expanded={open}
					className="inline-flex max-w-full items-center gap-2 rounded-lg pr-2 py-1 text-left transition-colors hover:bg-muted/60"
				>
					<span
						className={`icon-[mdi--chevron-right] h-4 w-4 shrink-0 text-muted-foreground/80 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
					/>
					<span className="flex h-5 min-w-5 items-center justify-center rounded bg-muted px-1.5 text-[11px] font-medium text-muted-foreground/60">
						{blockCount}
					</span>
					<span
						className={`min-w-0 truncate text-[12px] text-muted-foreground/50 ${allDone ? "" : "tool-call-shimmer-text"}`}
					>
						{summary}
					</span>
				</button>
			</div>
			<AnimatePresence initial={false}>
				{open && (
					<motion.div
						id={panelId}
						data-export-collapse-panel={exportMode ? "" : undefined}
						hidden={exportMode && !expanded && !forceExpanded}
						initial={COLLAPSE_INITIAL}
						animate={COLLAPSE_ANIMATE}
						exit={COLLAPSE_EXIT}
						transition={COLLAPSE_TRANSITION}
						className="overflow-hidden"
					>
						<div className="flex flex-col gap-0.5 pl-2 pr-1 pb-1">{children}</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}

export interface SegmentShellProps {
	animateIn?: boolean;
	children: ReactNode;
}

export const SegmentShell = memo(function SegmentShell({
	animateIn = false,
	children,
}: SegmentShellProps): JSX.Element | null {
	if (!children) return null;
	// Always the same wrapper so flipping animateIn does not remount children
	// (that remount dumped the whole segment as one flash).
	return (
		<motion.div
			initial={animateIn ? SEGMENT_INITIAL : false}
			animate={SEGMENT_ANIMATE}
			transition={SEGMENT_TRANSITION}
		>
			{children}
		</motion.div>
	);
});

export function ErrorBlockView({ text }: { text: string }): JSX.Element {
	return (
		<div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
			<span className="icon-[mdi--alert-circle-outline] mt-0.5 h-4 w-4 shrink-0 text-destructive/70" />
			<span
				className="text-[13px] leading-[1.6] text-destructive/90"
				style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
			>
				{text}
			</span>
		</div>
	);
}
