import { AnimatePresence, motion } from "motion/react";
import type { Transition } from "motion/react";
import type { JSX, ReactNode } from "react";
import { useId, useState } from "react";

const COLLAPSE_INITIAL = { height: 0, opacity: 0 };
const COLLAPSE_ANIMATE = { height: "auto", opacity: 1 };
const COLLAPSE_EXIT = { height: 0, opacity: 0 };
const COLLAPSE_TRANSITION = {
	duration: 0.2,
	ease: [0.25, 0.1, 0.25, 1] as const,
} satisfies Transition;

export interface ProgressGroupViewProps {
	/** Agent-authored stage title (in-progress or completed wording). */
	title: string;
	/** Number of calls folded into this stage. */
	blockCount: number;
	/** Stage finished — swaps the spinner for a check and stops the shimmer. */
	done: boolean;
	exportMode?: boolean;
	/** Controlled expansion. Host owns it so the state survives list virtualization. */
	expanded?: boolean;
	onToggle?: () => void;
	/** Expanded rows: one line per call. */
	children: ReactNode;
}

/**
 * Work-mode stage group: one readable line per stage, everything the agent did
 * inside it folded away. Deliberately quieter and less technical than
 * `ToolCallGroupView`, which stays the coding-mode rendering.
 */
export function ProgressGroupView({
	title,
	blockCount,
	done,
	exportMode = false,
	expanded: expandedProp,
	onToggle,
	children,
}: ProgressGroupViewProps): JSX.Element {
	const [uncontrolled, setUncontrolled] = useState(false);
	const expanded = expandedProp ?? uncontrolled;
	const toggle = onToggle ?? ((): void => setUncontrolled(!uncontrolled));
	const generatedId = useId();
	const panelId = exportMode ? `export-progress-group-${generatedId}` : undefined;
	const open = expanded || exportMode;
	const hasRows = blockCount > 0;

	return (
		<div className="relative w-fit max-w-full overflow-hidden rounded-lg px-1 py-0.5">
			<div className="inline-block max-w-full align-top">
				<button
					type="button"
					onClick={() => hasRows && toggle()}
					data-export-toggle={panelId}
					aria-expanded={open}
					disabled={!hasRows}
					className="inline-flex max-w-full items-center gap-2 rounded-lg py-1 pr-2 text-left transition-colors enabled:hover:bg-muted/60"
				>
					<span
						className={
							done
								? "icon-[mdi--check-circle-outline] h-4 w-4 shrink-0 text-muted-foreground/70"
								: "icon-[mdi--loading] h-4 w-4 shrink-0 animate-spin text-muted-foreground/70"
						}
					/>
					<span className={`min-w-0 truncate text-[13px] ${done ? "text-muted-foreground" : "tool-call-shimmer-text"}`}>
						{title}
					</span>
					{hasRows && (
						<span
							className={`icon-[mdi--chevron-right] h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
						/>
					)}
				</button>
			</div>
			<AnimatePresence initial={false}>
				{open && hasRows && (
					<motion.div
						id={panelId}
						data-export-collapse-panel={exportMode ? "" : undefined}
						hidden={exportMode && !expanded}
						initial={COLLAPSE_INITIAL}
						animate={COLLAPSE_ANIMATE}
						exit={COLLAPSE_EXIT}
						transition={COLLAPSE_TRANSITION}
						className="overflow-hidden"
					>
						<div className="flex flex-col gap-0.5 border-border/50 border-l pb-1 pl-3 ml-2">{children}</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}

export interface ProgressGroupRowProps {
	/** One-line, user-facing reason for this call. */
	text: string;
	status: "pending" | "success" | "error";
	/** Full coding-mode tool card, revealed on demand. */
	details?: ReactNode;
	exportMode?: boolean;
	/** Controlled expansion. Host owns it so the state survives list virtualization. */
	expanded?: boolean;
	onToggle?: () => void;
}

/** One folded call inside a stage: a sentence, plus opt-in access to the full card. */
export function ProgressGroupRow({
	text,
	status,
	details,
	exportMode = false,
	expanded,
	onToggle,
}: ProgressGroupRowProps): JSX.Element {
	const [uncontrolled, setUncontrolled] = useState(false);
	const open = expanded ?? uncontrolled;
	const toggle = onToggle ?? ((): void => setUncontrolled(!uncontrolled));
	const showDetails = Boolean(details) && (open || exportMode);

	return (
		<div className="flex flex-col gap-0.5">
			<button
				type="button"
				onClick={() => details && toggle()}
				aria-expanded={showDetails}
				disabled={!details}
				className="inline-flex max-w-full items-center gap-2 rounded py-0.5 pr-2 text-left transition-colors enabled:hover:bg-muted/50"
			>
				<span
					className={
						status === "pending"
							? "icon-[mdi--circle-outline] h-3 w-3 shrink-0 text-muted-foreground/50"
							: status === "error"
								? "icon-[mdi--alert-circle-outline] h-3 w-3 shrink-0 text-destructive/70"
								: "icon-[mdi--check] h-3 w-3 shrink-0 text-muted-foreground/50"
					}
				/>
				<span className="min-w-0 truncate text-[12px] text-muted-foreground/80">{text}</span>
				{details && (
					<span
						className={`icon-[mdi--chevron-right] h-3.5 w-3.5 shrink-0 text-muted-foreground/40 transition-transform duration-200 ${showDetails ? "rotate-90" : ""}`}
					/>
				)}
			</button>
			<AnimatePresence initial={false}>
				{showDetails && (
					<motion.div
						initial={COLLAPSE_INITIAL}
						animate={COLLAPSE_ANIMATE}
						exit={COLLAPSE_EXIT}
						transition={COLLAPSE_TRANSITION}
						className="overflow-hidden"
					>
						<div className="pb-1 pl-5">{details}</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}
