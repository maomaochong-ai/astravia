import { AnimatePresence, motion, type Transition } from "motion/react";
import type { JSX, ReactNode } from "react";

const INDICATOR_INITIAL = { opacity: 0, y: 6 };
const INDICATOR_ANIMATE = { opacity: 1, y: 0 };
const INDICATOR_EXIT = { opacity: 0, y: 6 };
const INDICATOR_TRANSITION = {
	duration: 0.25,
	ease: [0.25, 0.1, 0.25, 1] as const,
} satisfies Transition;

export interface MessageListFooterViewProps {
	readonly compactionLabel: string;
	readonly isCompacting: boolean;
	readonly pluginHost?: ReactNode;
	readonly showWaiting: boolean;
	readonly streamingIndicator: ReactNode;
	/** Workflow summary items (ADR-0044); rendered above the plugin host. */
	readonly workflowItems?: ReactNode;
}

function CompactionIndicator({ label }: { label: string }): JSX.Element {
	return (
		<motion.div
			initial={INDICATOR_INITIAL}
			animate={INDICATOR_ANIMATE}
			exit={INDICATOR_EXIT}
			transition={INDICATOR_TRANSITION}
			className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2"
		>
			<svg width={14} height={14} style={{ animation: "context-ring-spin 1s linear infinite" }}>
				<circle
					cx={7}
					cy={7}
					r={5}
					fill="none"
					stroke="currentColor"
					strokeWidth={1}
					opacity={0.3}
					className="text-muted-foreground"
				/>
				<circle
					cx={7}
					cy={7}
					r={5}
					fill="none"
					stroke="currentColor"
					strokeWidth={1}
					strokeDasharray={`${Math.PI * 5 * 0.25} ${Math.PI * 5 * 0.75}`}
					strokeLinecap="round"
					className="text-amber-500"
				/>
			</svg>
			<span className="text-[12px] text-amber-500/80">{label}</span>
		</motion.div>
	);
}

export function MessageListFooterView({
	compactionLabel,
	isCompacting,
	pluginHost,
	showWaiting,
	streamingIndicator,
	workflowItems,
}: MessageListFooterViewProps): JSX.Element {
	return (
		<div className="mx-auto flex max-w-3xl flex-col gap-2 px-5 pt-0">
			<AnimatePresence initial={false}>
				{isCompacting && <CompactionIndicator key="compacting" label={compactionLabel} />}
			</AnimatePresence>
			{showWaiting && !isCompacting && <div className="flex items-center">{streamingIndicator}</div>}
			{workflowItems}
			{pluginHost}
		</div>
	);
}
