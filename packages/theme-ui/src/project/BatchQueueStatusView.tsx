import type { JSX } from "react";

export type BatchQueueTaskStatus = "pending" | "running" | "completed" | "failed" | "paused";

export interface BatchQueueTaskItemView {
	id: string;
	name: string;
	status: BatchQueueTaskStatus;
	statusLabel: string;
	timeLabel: string | null;
	error: string | null;
	truncatedError: string | null;
	hasSessionPath: boolean;
	isQueued: boolean;
}

export interface BatchQueueStatusViewLabels {
	progressTitle: string;
	progressFraction: string;
	running: string;
	completed: string;
	failed: string;
	neverExecuted: string;
	stop: string;
	start: string;
	reset: string;
	queueTitle: string;
	matchCount: string;
	searchPlaceholder: string;
	clearSearch: string;
	noMatch: string;
	noTasks: string;
	goToSession: string;
	cancelQueued: string;
	run: string;
	retry: string;
	rerun: string;
}

export interface BatchQueueStatusViewProps {
	completed: number;
	failed: number;
	filteredTasks: readonly BatchQueueTaskItemView[];
	isBatchActive: boolean;
	labels: BatchQueueStatusViewLabels;
	neverExecuted: number;
	onBatchReset: () => void;
	onBatchStart: () => void;
	onBatchStop: () => void;
	onCancelQueued: (taskId: string) => void;
	onClearSearch: () => void;
	onGoToSession: (taskId: string) => void;
	onRetry: (taskId: string) => void;
	onRun: (taskId: string) => void;
	onSearchChange: (value: string) => void;
	progress: number;
	running: number;
	searchQuery: string;
	total: number;
}

export function BatchQueueStatusView({
	completed,
	failed,
	filteredTasks,
	isBatchActive,
	labels,
	neverExecuted,
	onBatchReset,
	onBatchStart,
	onBatchStop,
	onCancelQueued,
	onClearSearch,
	onGoToSession,
	onRetry,
	onRun,
	onSearchChange,
	progress,
	running,
	searchQuery,
	total,
}: BatchQueueStatusViewProps): JSX.Element {
	const normalizedQuery = searchQuery.trim();

	return (
		<div className="flex flex-col gap-5">
			<div className="rounded-2xl border border-border/40 bg-gradient-to-b from-accent/30 to-transparent p-5">
				<div className="mb-4">
					<div className="mb-2 flex items-end justify-between">
						<span className="text-[13px] font-medium text-foreground">{labels.progressTitle}</span>
						<span className="tabular-nums text-[22px] font-semibold leading-none tracking-tight text-foreground">
							{progress}
							<span className="text-[13px] font-normal text-muted-foreground/60">%</span>
						</span>
					</div>
					<div className="h-2 overflow-hidden rounded-full bg-accent/60">
						<div
							className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500 ease-out"
							style={{ width: `${progress}%` }}
						/>
					</div>
					<div className="mt-1.5 text-[11px] text-muted-foreground/50">{labels.progressFraction}</div>
				</div>

				<div className="grid grid-cols-4 gap-2">
					<StatusCounter label={labels.running} count={running} color="emerald" pulse={running > 0} />
					<StatusCounter label={labels.completed} count={completed} color="emerald" />
					<StatusCounter label={labels.failed} count={failed} color="red" />
					<StatusCounter label={labels.neverExecuted} count={neverExecuted} color="neutral" />
				</div>

				<div className="mt-4 flex items-center gap-1.5">
					{isBatchActive ? (
						<QueueActionButton icon="icon-[mdi--stop]" label={labels.stop} onClick={onBatchStop} />
					) : (
						<QueueActionButton
							icon="icon-[mdi--play]"
							label={labels.start}
							onClick={onBatchStart}
							disabled={neverExecuted === 0}
						/>
					)}
					<QueueActionButton
						icon="icon-[mdi--refresh]"
						label={labels.reset}
						onClick={onBatchReset}
						disabled={total === 0}
					/>
				</div>
			</div>

			<div className="flex flex-col gap-1.5">
				<div className="mb-1 flex items-center gap-2 px-1">
					<span className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground/40">
						{labels.queueTitle}
					</span>
					{normalizedQuery && (
						<span className="text-[11px] text-muted-foreground/50">{labels.matchCount}</span>
					)}
					<div className="h-px flex-1 bg-border/30" />
				</div>

				<div className="relative mb-1">
					<span className="icon-[mdi--magnify] pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
					<input
						type="text"
						value={searchQuery}
						onChange={(e) => onSearchChange(e.target.value)}
						placeholder={labels.searchPlaceholder}
						className="h-8 w-full rounded-lg border border-border/40 bg-card/30 pl-8 pr-8 text-[12px] text-foreground placeholder:text-muted-foreground/40 outline-none transition-colors focus:border-primary/40 focus:bg-card/50"
					/>
					{searchQuery && (
						<button
							type="button"
							onClick={onClearSearch}
							title={labels.clearSearch}
							className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-accent hover:text-foreground"
						>
							<span className="icon-[mdi--close] h-3 w-3" />
						</button>
					)}
				</div>

				{filteredTasks.length === 0 ? (
					<div className="flex flex-col items-center gap-1.5 rounded-xl bg-accent/20 py-6 text-center">
						<span className="icon-[mdi--magnify-close] h-5 w-5 text-muted-foreground/50" />
						<p className="text-[12px] text-muted-foreground/60">
							{normalizedQuery ? labels.noMatch : labels.noTasks}
						</p>
					</div>
				) : (
					filteredTasks.map((task) => (
						<TaskRow
							key={task.id}
							task={task}
							labels={labels}
							onRun={() => onRun(task.id)}
							onRetry={() => onRetry(task.id)}
							onCancelQueued={() => onCancelQueued(task.id)}
							onGoToSession={() => onGoToSession(task.id)}
						/>
					))
				)}
			</div>
		</div>
	);
}

function StatusCounter({
	label,
	count,
	color,
	pulse,
}: {
	label: string;
	count: number;
	color: "emerald" | "red" | "neutral";
	pulse?: boolean;
}): JSX.Element {
	const dotColor =
		color === "emerald" ? "bg-emerald-500" : color === "red" ? "bg-red-500" : "bg-muted-foreground/40";
	const pingColor = color === "emerald" ? "bg-emerald-400" : "";

	return (
		<div className="flex flex-col items-center gap-1 rounded-xl bg-accent/40 px-2 py-2.5">
			<div className="flex items-center gap-1.5">
				<div className="relative flex h-2 w-2">
					{pulse && count > 0 && (
						<span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-50 ${pingColor}`} />
					)}
					<span className={`relative inline-flex h-2 w-2 rounded-full ${dotColor}`} />
				</div>
				<span className="tabular-nums text-[15px] font-semibold text-foreground">{count}</span>
			</div>
			<span className="text-[10px] text-muted-foreground/60">{label}</span>
		</div>
	);
}

function QueueActionButton({
	icon,
	label,
	onClick,
	disabled,
}: {
	icon: string;
	label: string;
	onClick: () => void;
	disabled?: boolean;
}): JSX.Element {
	return (
		<button
			type="button"
			disabled={disabled}
			onClick={onClick}
			className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-all duration-150 active:scale-[0.97] ${
				disabled
					? "cursor-not-allowed text-muted-foreground/20"
					: "text-muted-foreground hover:bg-accent hover:text-foreground"
			}`}
		>
			<span className={`${icon} h-3.5 w-3.5`} />
			{label}
		</button>
	);
}

function TaskRow({
	task,
	labels,
	onRun,
	onRetry,
	onCancelQueued,
	onGoToSession,
}: {
	task: BatchQueueTaskItemView;
	labels: BatchQueueStatusViewLabels;
	onRun: () => void;
	onRetry: () => void;
	onCancelQueued: () => void;
	onGoToSession: () => void;
}): JSX.Element {
	const dotColor = task.isQueued
		? "bg-yellow-500"
		: task.status === "completed"
			? "bg-emerald-500"
			: task.status === "running"
				? "bg-emerald-500"
				: task.status === "failed"
					? "bg-red-500"
					: "bg-muted-foreground/30";

	return (
		<div className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-150 hover:bg-accent/40">
			<div className="relative flex h-2 w-2 shrink-0">
				{task.status === "running" && !task.isQueued && (
					<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />
				)}
				<span className={`relative inline-flex h-2 w-2 rounded-full ${dotColor}`} />
			</div>

			<span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{task.name}</span>

			{task.status === "failed" && task.error && (
				<div className="flex items-center gap-1 text-red-400/80" title={task.error}>
					<span className="icon-[mdi--alert-circle-outline] h-3.5 w-3.5" />
					<span className="hidden max-w-[120px] truncate text-[11px] sm:inline">
						{task.truncatedError}
					</span>
				</div>
			)}

			<span className="shrink-0 text-[11px] text-muted-foreground/50">{task.statusLabel}</span>

			{task.timeLabel && (
				<span className="hidden shrink-0 text-[11px] text-muted-foreground/30 sm:inline">
					{task.timeLabel}
				</span>
			)}

			<div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
				{task.hasSessionPath && (
					<button
						type="button"
						onClick={onGoToSession}
						title={labels.goToSession}
						className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-accent hover:text-foreground"
					>
						<span className="icon-[mdi--open-in-new] h-3.5 w-3.5" />
					</button>
				)}
				{task.isQueued ? (
					<button
						type="button"
						onClick={onCancelQueued}
						title={labels.cancelQueued}
						className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-accent hover:text-foreground"
					>
						<span className="icon-[mdi--close] h-3.5 w-3.5" />
					</button>
				) : task.status === "pending" ? (
					<button
						type="button"
						onClick={onRun}
						title={labels.run}
						className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-accent hover:text-foreground"
					>
						<span className="icon-[mdi--play] h-3.5 w-3.5" />
					</button>
				) : task.status === "failed" ? (
					<button
						type="button"
						onClick={onRetry}
						title={labels.retry}
						className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-accent hover:text-foreground"
					>
						<span className="icon-[mdi--restart] h-3.5 w-3.5" />
					</button>
				) : task.status === "completed" ? (
					<button
						type="button"
						onClick={onRetry}
						title={labels.rerun}
						className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-accent hover:text-foreground"
					>
						<span className="icon-[mdi--restart] h-3.5 w-3.5" />
					</button>
				) : null}
			</div>
		</div>
	);
}
