import type { JSX } from "react";

export interface ScheduleTaskItemView {
	id: string;
	name: string;
	enabled: boolean;
	scheduleLabel: string;
	lastRunLabel: string;
	lastRunStatus: "success" | "failed" | "running" | null;
}

export interface ScheduleStatusViewLabels {
	sectionTitle: string;
	pause: string;
	enable: string;
	runNow: string;
	run: string;
	success: string;
	failed: string;
}

export interface ScheduleStatusViewProps {
	labels: ScheduleStatusViewLabels;
	onRun: (taskId: string) => void;
	onToggle: (taskId: string) => void;
	tasks: readonly ScheduleTaskItemView[];
}

export function ScheduleStatusView({
	labels,
	onRun,
	onToggle,
	tasks,
}: ScheduleStatusViewProps): JSX.Element | null {
	if (tasks.length === 0) return null;

	return (
		<div className="px-8 py-5">
			<div className="mb-3 flex items-center gap-2.5">
				<div className="flex h-6 w-6 items-center justify-center rounded-md bg-accent/60">
					<span className="icon-[mdi--clock-outline] h-3.5 w-3.5 text-muted-foreground" />
				</div>
				<h2 className="text-[13px] font-semibold text-foreground">{labels.sectionTitle}</h2>
			</div>
			<div className="space-y-2">
				{tasks.map((task) => (
					<div
						key={task.id}
						className="flex items-center justify-between rounded-xl border border-border/30 bg-muted/15 px-4 py-3 transition-colors duration-200 hover:bg-muted/25"
					>
						<div className="flex min-w-0 items-center gap-3">
							<div className="relative flex h-2 w-2 shrink-0">
								<span
									className={`absolute inline-flex h-full w-full rounded-full ${
										task.enabled ? "animate-ping bg-emerald-400 opacity-50" : ""
									}`}
								/>
								<span
									className={`relative inline-flex h-2 w-2 rounded-full ${
										task.enabled ? "bg-emerald-500" : "bg-muted-foreground/30"
									}`}
								/>
							</div>
							<div className="min-w-0">
								<div className="truncate text-[13px] font-medium text-foreground">{task.name}</div>
								<div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground/50">
									<span className="flex items-center gap-1">
										<span className="icon-[mdi--clock-outline] text-[12px]" />
										{task.scheduleLabel}
									</span>
									<span className="flex items-center gap-1">
										<span className="icon-[mdi--history] text-[12px]" />
										{task.lastRunLabel}
										{task.lastRunStatus === "success" && (
											<span className="text-emerald-500">{labels.success}</span>
										)}
										{task.lastRunStatus === "failed" && (
											<span className="text-red-400">{labels.failed}</span>
										)}
									</span>
								</div>
							</div>
						</div>
						<div className="flex shrink-0 items-center gap-1.5">
							<button
								type="button"
								className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border/50 p-0 text-muted-foreground/70 transition-all duration-200 hover:border-foreground/20 hover:text-foreground"
								onClick={() => onToggle(task.id)}
								title={task.enabled ? labels.pause : labels.enable}
							>
								<span
									className={`${task.enabled ? "icon-[mdi--pause]" : "icon-[mdi--play]"} h-3.5 w-3.5`}
								/>
							</button>
							<button
								type="button"
								className="inline-flex h-7 items-center justify-center gap-1.5 rounded-lg border border-border/50 px-2.5 text-muted-foreground/70 transition-all duration-200 hover:border-foreground/20 hover:text-foreground"
								onClick={() => onRun(task.id)}
								title={labels.runNow}
							>
								<span className="icon-[mdi--play-circle-outline] h-3.5 w-3.5" />
								<span className="text-[12px]">{labels.run}</span>
							</button>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
