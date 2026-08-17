import { AnimatePresence, motion } from "motion/react";
import { memo, useState, type JSX } from "react";
import { OverlayActionButton, QUEUED_TONE, STATUS_TONE } from "./batchTaskUi";
import type { BatchTaskCardCallbacks, BatchTaskCardLabels, BatchTaskViewItem } from "./types";

export interface BatchTaskCardViewProps {
	callbacks: BatchTaskCardCallbacks;
	labels: BatchTaskCardLabels;
	task: BatchTaskViewItem;
}

export const BatchTaskCardView = memo(function BatchTaskCardView({
	callbacks,
	labels,
	task,
}: BatchTaskCardViewProps): JSX.Element {
	const tone = task.isQueued ? QUEUED_TONE : STATUS_TONE[task.status];
	const [hovered, setHovered] = useState(false);

	return (
		<div
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
			className="relative flex flex-col gap-1 overflow-hidden rounded-lg bg-card px-2.5 py-2 transition-colors duration-300 ease-out hover:bg-accent"
		>
			<div className="flex items-center gap-1.5">
				<div className="relative flex h-1.5 w-1.5 shrink-0">
					{task.status === "running" && !task.isQueued && (
						<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
					)}
					<span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${tone.dot}`} />
				</div>
				<span className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground">{task.name}</span>
				<span
					className={`inline-flex h-4 shrink-0 items-center rounded-full px-1.5 text-[9px] font-medium leading-none ${tone.bg} ${tone.text}`}
				>
					{task.statusLabel}
				</span>
			</div>

			<div className="flex items-center text-[10px] text-muted-foreground/50">
				{task.timeLabel !== null ? (
					<span className="flex items-center gap-0.5">
						<span className="icon-[solar--clock-circle-linear] h-2.5 w-2.5" />
						{task.timeLabel}
					</span>
				) : (
					<span className="text-muted-foreground/40">{labels.notRun}</span>
				)}
				{task.status === "failed" && task.error && (
					<span className="ml-auto flex max-w-[60%] items-center gap-0.5 truncate text-destructive" title={task.error}>
						<span className="icon-[solar--danger-circle-linear] h-2.5 w-2.5 shrink-0" />
						<span className="truncate">{task.error}</span>
					</span>
				)}
			</div>

			<AnimatePresence>
				{hovered && (
					<motion.div
						key="overlay"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
						className="absolute inset-0 flex items-center justify-center gap-1.5 bg-background/75 backdrop-blur-[3px]"
					>
						{task.sessionPath && (
							<OverlayActionButton
								icon="icon-[solar--square-top-down-linear]"
								title={labels.goToSession}
								onClick={(event) => {
									event.stopPropagation();
									callbacks.goToSession(task.id);
								}}
							/>
						)}
						{task.isQueued ? (
							<OverlayActionButton
								icon="icon-[solar--close-circle-linear]"
								title={labels.cancelWait}
								variant="danger"
								onClick={(event) => {
									event.stopPropagation();
									callbacks.stop(task.id);
								}}
							/>
						) : task.status === "pending" ? (
							<OverlayActionButton
								icon="icon-[solar--play-linear]"
								title={labels.run}
								onClick={(event) => {
									event.stopPropagation();
									callbacks.run(task.id);
								}}
							/>
						) : task.status === "paused" ? (
							<OverlayActionButton
								icon="icon-[solar--play-linear]"
								title={labels.resume}
								onClick={(event) => {
									event.stopPropagation();
									callbacks.resume(task.id);
								}}
							/>
						) : task.status === "failed" ? (
							<OverlayActionButton
								icon="icon-[solar--restart-linear]"
								title={labels.retry}
								variant="danger"
								onClick={(event) => {
									event.stopPropagation();
									callbacks.retry(task.id);
								}}
							/>
						) : task.status === "completed" ? (
							<OverlayActionButton
								icon="icon-[solar--restart-linear]"
								title={labels.rerun}
								onClick={(event) => {
									event.stopPropagation();
									callbacks.retry(task.id);
								}}
							/>
						) : null}
						{task.status !== "running" && (
							<OverlayActionButton
								icon="icon-[solar--trash-bin-trash-linear]"
								title={labels.delete}
								variant="danger"
								onClick={(event) => {
									event.stopPropagation();
									callbacks.delete(task.id);
								}}
							/>
						)}
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
});
