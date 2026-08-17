import type { JSX, ReactNode } from "react";

export interface ScheduleSummaryCardItem {
	label: string;
	value: number;
	icon: string;
}

export interface ScheduleTaskControlItem {
	id: string;
	name: string;
	enabledBadge: string;
	enabledBadgeClassName: string;
	/** Host action buttons (run / toggle). */
	actions: ReactNode;
}

export interface ScheduleRecordItem {
	id: string;
	taskName: string;
	timeLabel: string;
	statusLabel: string;
	statusClassName: string;
	durationLabel: string | null;
	error: string | null;
	preview: string | null;
	clickable: boolean;
	onClick: () => void;
}

export interface ScheduleExecutionTabPanelViewLabels {
	noTasks: string;
	overview: string;
	taskControl: string;
	executionRecords: string;
	noRecords: string;
}

export interface ScheduleExecutionTabPanelViewProps {
	labels: ScheduleExecutionTabPanelViewLabels;
	/** Null when project has no scheduled tasks. */
	empty: boolean;
	summaries: readonly ScheduleSummaryCardItem[];
	/** Host refresh Button. */
	refreshButton: ReactNode;
	tasks: readonly ScheduleTaskControlItem[];
	records: readonly ScheduleRecordItem[];
}

function SummaryCard({ label, value, icon }: ScheduleSummaryCardItem): JSX.Element {
	return (
		<div className="rounded-lg border border-border/40 bg-background/50 px-2 py-2">
			<div className="mb-1 flex items-center gap-1 text-[10px] text-muted-foreground/70">
				<span className={`${icon} h-3 w-3`} />
				<span>{label}</span>
			</div>
			<div className="text-[15px] font-semibold tabular-nums text-foreground">{value}</div>
		</div>
	);
}

/**
 * Schedule execution tab UI. Host injects Button slots for refresh / run / toggle.
 */
export function ScheduleExecutionTabPanelView({
	labels,
	empty,
	summaries,
	refreshButton,
	tasks,
	records,
}: ScheduleExecutionTabPanelViewProps): JSX.Element {
	if (empty) {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground/50">
				<span className="icon-[mdi--history] text-[26px]" />
				<span className="text-[12px]">{labels.noTasks}</span>
			</div>
		);
	}

	return (
		<div className="flex h-full min-h-0 flex-col overflow-hidden">
			<div className="shrink-0 border-b border-border/50 px-3 py-3">
				<div className="mb-2 flex items-center justify-between">
					<span className="text-[12px] font-medium text-foreground">{labels.overview}</span>
					{refreshButton}
				</div>
				<div className="grid grid-cols-3 gap-2">
					{summaries.map((item) => (
						<SummaryCard key={item.label} {...item} />
					))}
				</div>
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
				<div className="mb-3">
					<div className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground/45">
						{labels.taskControl}
					</div>
					<div className="space-y-2">
						{tasks.map((task) => (
							<div key={task.id} className="rounded-xl border border-border/40 bg-accent/20 p-2.5">
								<div className="mb-1.5 flex items-center justify-between gap-2">
									<span className="truncate text-[12px] font-medium text-foreground">{task.name}</span>
									<span className={`rounded-md px-1.5 py-0.5 text-[10px] ${task.enabledBadgeClassName}`}>
										{task.enabledBadge}
									</span>
								</div>
								<div className="flex items-center gap-1.5">{task.actions}</div>
							</div>
						))}
					</div>
				</div>

				<div>
					<div className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground/45">
						{labels.executionRecords}
					</div>
					{records.length === 0 ? (
						<div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border/50 py-8 text-muted-foreground/50">
							<span className="icon-[mdi--timeline-text-outline] text-[20px]" />
							<span className="text-[12px]">{labels.noRecords}</span>
						</div>
					) : (
						<div className="space-y-2">
							{records.map((record) => (
								<button
									key={record.id}
									type="button"
									onClick={record.onClick}
									disabled={!record.clickable}
									className={`w-full rounded-xl border border-border/40 p-2.5 text-left transition-colors ${
										record.clickable ? "bg-background hover:bg-accent/30" : "cursor-default bg-muted/20"
									}`}
								>
									<div className="mb-1.5 flex items-center justify-between gap-2">
										<div className="min-w-0">
											<div className="truncate text-[12px] font-medium text-foreground">{record.taskName}</div>
											<div className="text-[11px] text-muted-foreground/60">{record.timeLabel}</div>
										</div>
										<span className={`rounded-md px-1.5 py-0.5 text-[10px] ${record.statusClassName}`}>
											{record.statusLabel}
										</span>
									</div>
									<div className="flex items-center gap-2 text-[11px] text-muted-foreground/60">
										{record.durationLabel && <span>{record.durationLabel}</span>}
										{record.error && <span className="truncate text-red-500">{record.error}</span>}
										{!record.error && record.preview && <span className="truncate">{record.preview}</span>}
										{record.clickable && (
											<span className="icon-[mdi--open-in-new] ml-auto h-3.5 w-3.5 shrink-0" />
										)}
									</div>
								</button>
							))}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
