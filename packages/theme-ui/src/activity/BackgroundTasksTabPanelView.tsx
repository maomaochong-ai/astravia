import type { JSX } from "react";
import { useEffect, useRef } from "react";

export type BackgroundTaskStatus = "running" | "completed" | "failed" | "killed";

export type SubagentWorkStatus = "queued" | "pending" | "running" | "completed" | "failed" | "interrupted";

/** Bash background task row (run_in_background). */
export interface BackgroundTaskViewItem {
	kind?: "bash";
	id: string;
	command: string;
	status: BackgroundTaskStatus;
	tail: string;
	exitCode?: number;
	statusIcon: string;
	statusLabel: string;
	statusClassName: string;
	durationLabel: string;
}

/** Subagent child row (explorer / future types) — same tab, different card. */
export interface SubagentWorkViewItem {
	kind: "subagent";
	id: string;
	agentType: string;
	taskName: string;
	path: string;
	status: SubagentWorkStatus;
	taskPreview: string;
	finalText?: string;
	errorMessage?: string;
	statusIcon: string;
	statusLabel: string;
	statusClassName: string;
	durationLabel: string;
}

export type BackgroundWorkViewItem = BackgroundTaskViewItem | SubagentWorkViewItem;

export interface BackgroundTasksTabPanelViewProps {
	items: readonly BackgroundWorkViewItem[];
	emptyLabel: string;
	/** Null when there are no finished bash tasks (hide clear button). */
	clearFinishedLabel: string | null;
	onClearFinished: () => void;
	/** Label for the per-task stop button (running tasks only). */
	stopLabel: string;
	/** Bash: task id; Subagent: child id / path. */
	onStop: (id: string, kind: "bash" | "subagent") => void;
}

function BashTaskCard({
	task,
	stopLabel,
	onStop,
}: {
	task: BackgroundTaskViewItem;
	stopLabel: string;
	onStop: (taskId: string) => void;
}): JSX.Element {
	const tailRef = useRef<HTMLPreElement>(null);

	useEffect(() => {
		const el = tailRef.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [task.tail]);

	const running = task.status === "running";

	return (
		<div className="min-w-0 overflow-hidden rounded-lg border border-border bg-background p-2.5">
			{/* Left: badges (name truncates). Right: status/duration/stop never wrap or shrink. */}
			<div className="flex min-w-0 items-center gap-1.5">
				<span className={`${task.statusIcon} h-3.5 w-3.5 shrink-0 ${task.statusClassName}`} />
				<span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">bash</span>
				<span
					className="min-w-0 flex-1 truncate rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground"
					title={task.id}
				>
					{task.id}
				</span>
				<span className={`shrink-0 whitespace-nowrap text-[11px] font-medium ${task.statusClassName}`}>
					{task.statusLabel}
				</span>
				{task.exitCode !== undefined && (
					<span className="shrink-0 whitespace-nowrap text-[10px] text-muted-foreground/70">
						exit {task.exitCode}
					</span>
				)}
				<span className="shrink-0 whitespace-nowrap text-[10px] text-muted-foreground/70">
					{task.durationLabel}
				</span>
				{running && (
					<button
						type="button"
						onClick={() => onStop(task.id)}
						title={stopLabel}
						aria-label={stopLabel}
						className="flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] whitespace-nowrap text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
					>
						<span className="icon-[mdi--stop-circle-outline] h-3 w-3" />
						<span>{stopLabel}</span>
					</button>
				)}
			</div>
			<div className="mt-1.5 min-w-0 truncate font-mono text-[11px] text-foreground" title={task.command}>
				{task.command}
			</div>
			{task.tail && (
				<pre
					ref={tailRef}
					className="mt-1.5 max-h-[120px] overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted/60 p-1.5 font-mono text-[10px] leading-relaxed text-muted-foreground"
				>
					{task.tail}
				</pre>
			)}
		</div>
	);
}

function SubagentCard({
	item,
	stopLabel,
	onStop,
}: {
	item: SubagentWorkViewItem;
	stopLabel: string;
	onStop: (id: string) => void;
}): JSX.Element {
	const active = item.status === "pending" || item.status === "running";
	return (
		<div className="min-w-0 overflow-hidden rounded-lg border border-border bg-background p-2.5">
			{/* taskName is the only flexible chip; status/duration/stop stay on one line. */}
			<div className="flex min-w-0 items-center gap-1.5">
				<span className={`${item.statusIcon} h-3.5 w-3.5 shrink-0 ${item.statusClassName}`} />
				<span className="shrink-0 rounded bg-primary/10 px-1 py-0.5 text-[10px] font-medium text-primary">
					{item.agentType}
				</span>
				<span
					className="min-w-0 flex-1 truncate rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground"
					title={item.taskName}
				>
					{item.taskName}
				</span>
				<span className={`shrink-0 whitespace-nowrap text-[11px] font-medium ${item.statusClassName}`}>
					{item.statusLabel}
				</span>
				<span className="shrink-0 whitespace-nowrap text-[10px] text-muted-foreground/70">
					{item.durationLabel}
				</span>
				{active && (
					<button
						type="button"
						onClick={() => onStop(item.id)}
						title={stopLabel}
						aria-label={stopLabel}
						className="flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] whitespace-nowrap text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
					>
						<span className="icon-[mdi--stop-circle-outline] h-3 w-3" />
						<span>{stopLabel}</span>
					</button>
				)}
			</div>
			<div className="mt-1.5 min-w-0 truncate text-[11px] text-foreground" title={item.taskPreview}>
				{item.taskPreview}
			</div>
			{item.errorMessage && (
				<div className="mt-1 min-w-0 break-words text-[10px] text-destructive">{item.errorMessage}</div>
			)}
			{item.finalText && (
				<pre className="mt-1.5 max-h-[120px] overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted/60 p-1.5 font-mono text-[10px] leading-relaxed text-muted-foreground">
					{item.finalText}
				</pre>
			)}
		</div>
	);
}

export function BackgroundTasksTabPanelView({
	items,
	emptyLabel,
	clearFinishedLabel,
	onClearFinished,
	stopLabel,
	onStop,
}: BackgroundTasksTabPanelViewProps): JSX.Element {
	if (items.length === 0) {
		return (
			<div className="flex flex-1 items-center justify-center p-4 text-sm text-muted-foreground">
				{emptyLabel}
			</div>
		);
	}

	return (
		<div className="flex min-h-0 min-w-0 flex-1 flex-col">
			{clearFinishedLabel !== null && (
				<div className="flex shrink-0 items-center justify-end px-2.5 pt-2">
					<button
						type="button"
						onClick={onClearFinished}
						className="flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					>
						<span className="icon-[mdi--broom] h-3 w-3 shrink-0" />
						<span className="truncate">{clearFinishedLabel}</span>
					</button>
				</div>
			)}
			<div className="min-w-0 flex-1 space-y-2 overflow-y-auto overflow-x-hidden p-2.5">
				{items.map((item) =>
					item.kind === "subagent" ? (
						<SubagentCard
							key={`subagent:${item.id}`}
							item={item}
							stopLabel={stopLabel}
							onStop={(id) => onStop(id, "subagent")}
						/>
					) : (
						<BashTaskCard
							key={`bash:${item.id}`}
							task={item}
							stopLabel={stopLabel}
							onStop={(id) => onStop(id, "bash")}
						/>
					),
				)}
			</div>
		</div>
	);
}
