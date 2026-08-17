import type { JSX } from "react";
import type { BatchProjectGroupLabels } from "./types";

export interface BatchProjectGroupTaskItem {
	id: string;
	name: string;
	timeLabel: string;
	isActive: boolean;
	onSelect: () => void;
}

export interface BatchProjectGroupViewProps {
	isExpanded: boolean;
	labels: BatchProjectGroupLabels;
	onToggle: () => void;
	projectName: string;
	sessionCount: number;
	tasks: readonly BatchProjectGroupTaskItem[];
}

function BatchProjectBadge({ label }: { label: string }): JSX.Element {
	return (
		<span className="inline-flex items-center rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
			{label}
		</span>
	);
}

function BatchTaskRow({ task }: { task: BatchProjectGroupTaskItem }): JSX.Element {
	return (
		<button
			type="button"
			onClick={task.onSelect}
			className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-[6px] text-left transition-colors duration-100 ${
				task.isActive ? "bg-accent dark:bg-accent/70" : "hover:bg-accent/50"
			}`}
		>
			<span className="icon-[mdi--chat-outline] h-3 w-3 shrink-0 text-muted-foreground" />
			<span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{task.name || task.id}</span>
			<span className="shrink-0 text-[11px] text-muted-foreground">{task.timeLabel}</span>
		</button>
	);
}

export function BatchProjectGroupView({
	isExpanded,
	labels,
	onToggle,
	projectName,
	sessionCount,
	tasks,
}: BatchProjectGroupViewProps): JSX.Element {
	return (
		<div className="mb-1">
			<button
				type="button"
				onClick={onToggle}
				className="group flex w-full items-center gap-2 rounded-lg px-2.5 py-[6px] text-left hover:bg-accent/50"
			>
				<BatchProjectBadge label={labels.badge} />

				<span className="icon-[mdi--folder-outline] h-4 w-4 shrink-0 text-foreground" />
				<span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">{projectName}</span>

				<span className="shrink-0 text-[11px] text-muted-foreground">{sessionCount}</span>
			</button>

			{isExpanded && (
				<div className="mt-px space-y-px">
					{tasks.map((task) => (
						<BatchTaskRow key={task.id} task={task} />
					))}
				</div>
			)}
		</div>
	);
}
