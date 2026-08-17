import { useMemo, useState, type JSX } from "react";
import { BatchTaskGridView } from "./BatchTaskGridView";
import { BatchTaskProjectActionsView } from "./BatchTaskProjectActionsView";
import { BatchTaskProjectHeaderView } from "./BatchTaskProjectHeaderView";
import { TASK_COLLAPSE_THRESHOLD } from "./batchTaskUi";
import type {
	BatchProjectCountsView,
	BatchTaskCardCallbacks,
	BatchTaskCardLabels,
	BatchTaskGridLabels,
	BatchTaskProjectActionsLabels,
	BatchTaskProjectBlockCallbacks,
	BatchTaskProjectHeaderLabels,
	BatchTaskViewItem,
} from "./types";

export interface BatchTaskProjectBlockViewProps {
	cardLabels: BatchTaskCardLabels;
	callbacks: BatchTaskProjectBlockCallbacks;
	counts: BatchProjectCountsView;
	gridLabels: BatchTaskGridLabels;
	hasQueued: boolean;
	headerLabels: BatchTaskProjectHeaderLabels;
	projectName: string;
	actionsLabels: BatchTaskProjectActionsLabels;
	/** Tasks pre-sorted by host; view owns filter/collapse. */
	tasks: readonly BatchTaskViewItem[];
}

export function BatchTaskProjectBlockView({
	actionsLabels,
	cardLabels,
	callbacks,
	counts,
	gridLabels,
	hasQueued,
	headerLabels,
	projectName,
	tasks,
}: BatchTaskProjectBlockViewProps): JSX.Element {
	const progress = counts.total > 0 ? (counts.completed / counts.total) * 100 : 0;
	const [expanded, setExpanded] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const normalizedQuery = searchQuery.trim().toLowerCase();

	const filteredTasks = useMemo(
		() =>
			normalizedQuery ? tasks.filter((task) => task.name.toLowerCase().includes(normalizedQuery)) : tasks,
		[tasks, normalizedQuery],
	);
	const filteredTotal = filteredTasks.length;
	const collapsed = !normalizedQuery && !expanded && filteredTotal > TASK_COLLAPSE_THRESHOLD;
	const visibleTasks = collapsed ? filteredTasks.slice(0, TASK_COLLAPSE_THRESHOLD) : filteredTasks;
	const hiddenCount = filteredTotal - visibleTasks.length;

	const cardCallbacks = useMemo<BatchTaskCardCallbacks>(
		() => ({
			delete: callbacks.deleteTask,
			goToSession: callbacks.goToSession,
			resume: callbacks.resume,
			retry: callbacks.retry,
			run: callbacks.run,
			stop: callbacks.stop,
		}),
		[callbacks],
	);

	return (
		<div className="relative">
			<div className="flex items-center gap-3 pb-3">
				<BatchTaskProjectHeaderView
					counts={counts}
					filteredTotal={filteredTotal}
					labels={headerLabels}
					normalizedQuery={normalizedQuery}
					onResetFailed={callbacks.resetFailed}
					projectName={projectName}
				/>
				<BatchTaskProjectActionsView
					counts={counts}
					hasQueued={hasQueued}
					labels={actionsLabels}
					onBatchReset={callbacks.batchReset}
					onBatchStart={callbacks.batchStart}
					onBatchStop={callbacks.batchStop}
					onDeleteProject={callbacks.deleteProject}
					onEditProject={callbacks.editProject}
				/>
			</div>

			<div className="pb-3">
				<div className="relative h-1 overflow-hidden rounded-full bg-accent/30">
					<div
						className="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width] duration-700 ease-out"
						style={{ width: `${progress}%` }}
					/>
				</div>
			</div>

			<BatchTaskGridView
				callbacks={cardCallbacks}
				cardLabels={cardLabels}
				collapsed={collapsed}
				countsTotal={counts.total}
				filteredTotal={filteredTotal}
				hiddenCount={hiddenCount}
				labels={gridLabels}
				normalizedQuery={normalizedQuery}
				onClearSearch={() => setSearchQuery("")}
				onSearchChange={setSearchQuery}
				onToggleExpanded={() => setExpanded((value) => !value)}
				searchQuery={searchQuery}
				visibleTasks={visibleTasks}
			/>
		</div>
	);
}
