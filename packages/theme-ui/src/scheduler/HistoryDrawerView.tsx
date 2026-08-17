import { AnimatePresence, motion } from "motion/react";
import type { JSX, ReactNode } from "react";

const easeOut = [0.22, 1, 0.36, 1] as const;

export interface HistoryDrawerTaskView {
	readonly id: string;
	readonly name: string;
	readonly enabled: boolean;
}

export interface HistoryDrawerViewLabels {
	readonly close: string;
	readonly edit: string;
	readonly enable: string;
	readonly pause: string;
	readonly runNow: string;
}

export interface HistoryDrawerViewProps {
	readonly history: ReactNode;
	readonly labels: HistoryDrawerViewLabels;
	readonly projectLabel: string | null;
	readonly scheduleLabel: string;
	readonly task: HistoryDrawerTaskView | null;
	readonly onClose: () => void;
	readonly onEdit: () => void;
	readonly onRunNow: () => void;
	readonly onToggleTask: () => void;
}

export function HistoryDrawerView({
	history,
	labels,
	projectLabel,
	scheduleLabel,
	task,
	onClose,
	onEdit,
	onRunNow,
	onToggleTask,
}: HistoryDrawerViewProps): JSX.Element {
	return (
		<AnimatePresence>
			{task && (
				<>
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.2 }}
						onClick={onClose}
						className="absolute inset-0 z-40 bg-background/40 backdrop-blur-[2px]"
					/>

					<motion.div
						initial={{ x: "100%" }}
						animate={{ x: 0 }}
						exit={{ x: "100%" }}
						transition={{ duration: 0.32, ease: easeOut }}
						className="absolute inset-y-0 right-0 z-50 flex w-[420px] max-w-[88%] flex-col border-l border-border bg-background shadow-[-16px_0_40px_-20px_rgba(0,0,0,0.5)]"
					>
						<div className="shrink-0 border-b border-border/60 px-5 pb-4 pt-5">
							<div className="flex items-start gap-2.5">
								<span className="mt-1 flex h-2 w-2 shrink-0">
									<span className="relative inline-flex h-2 w-2">
										{task.enabled && (
											<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
										)}
										<span
											className={`relative inline-flex h-2 w-2 rounded-full ${
												task.enabled ? "bg-emerald-500" : "bg-muted-foreground/40"
											}`}
										/>
									</span>
								</span>
								<div className="min-w-0 flex-1">
									<h2 className="truncate text-[15px] font-semibold tracking-tight text-foreground">
										{task.name}
									</h2>
									<p className="mt-0.5 truncate text-[11px] text-muted-foreground/50">
										{scheduleLabel}
										{projectLabel && ` · ${projectLabel}`}
									</p>
								</div>
								<button
									type="button"
									onClick={onClose}
									title={labels.close}
									className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground/60 transition-colors duration-150 hover:bg-accent hover:text-foreground"
								>
									<span className="icon-[mdi--close] text-[16px]" />
								</button>
							</div>

							<div className="mt-3.5 flex items-center gap-2">
								<DrawerAction
									icon="icon-[mdi--play]"
									label={labels.runNow}
									primary
									onClick={onRunNow}
								/>
								<DrawerAction
									icon={task.enabled ? "icon-[mdi--pause]" : "icon-[mdi--play-outline]"}
									label={task.enabled ? labels.pause : labels.enable}
									onClick={onToggleTask}
								/>
								<DrawerAction
									icon="icon-[mdi--pencil-outline]"
									label={labels.edit}
									onClick={onEdit}
								/>
							</div>
						</div>

						{history}
					</motion.div>
				</>
			)}
		</AnimatePresence>
	);
}

function DrawerAction({
	icon,
	label,
	primary,
	onClick,
}: {
	readonly icon: string;
	readonly label: string;
	readonly primary?: boolean;
	readonly onClick: () => void;
}): JSX.Element {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12px] font-medium transition-colors duration-150 ${
				primary
					? "bg-primary/90 text-primary-foreground hover:bg-primary"
					: "border border-border/60 text-muted-foreground hover:bg-accent hover:text-foreground"
			}`}
		>
			<span className={`${icon} text-[14px]`} />
			{label}
		</button>
	);
}
