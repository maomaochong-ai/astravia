import type { JSX } from "react";
import { ActionIconButton } from "./batchTaskUi";
import type { BatchProjectCountsView, BatchTaskProjectActionsLabels } from "./types";

export interface BatchTaskProjectActionsViewProps {
	counts: BatchProjectCountsView;
	hasQueued: boolean;
	labels: BatchTaskProjectActionsLabels;
	onBatchReset: () => void;
	onBatchStart: () => void;
	onBatchStop: () => void;
	onDeleteProject: () => void;
	onEditProject: () => void;
}

export function BatchTaskProjectActionsView({
	counts,
	hasQueued,
	labels,
	onBatchReset,
	onBatchStart,
	onBatchStop,
	onDeleteProject,
	onEditProject,
}: BatchTaskProjectActionsViewProps): JSX.Element {
	const isActive = counts.running > 0 || hasQueued;
	const startDisabled = counts.neverExecuted === 0 && counts.paused === 0;
	const startTitle = startDisabled
		? counts.failed > 0
			? labels.allDoneOrFailed(counts.failed)
			: labels.allDone
		: labels.start;

	return (
		<div className="flex items-center gap-0.5">
			{isActive ? (
				<ActionIconButton
					icon="icon-[solar--stop-linear]"
					title={labels.stop}
					variant="danger"
					onClick={onBatchStop}
				/>
			) : (
				<ActionIconButton
					icon="icon-[solar--play-linear]"
					title={startTitle}
					onClick={onBatchStart}
					disabled={startDisabled}
				/>
			)}
			<ActionIconButton
				icon="icon-[solar--refresh-linear]"
				title={labels.reset}
				variant="danger"
				onClick={onBatchReset}
				disabled={counts.total === 0}
			/>
			<div className="mx-1 h-4 w-px bg-border/60" />
			<ActionIconButton
				icon="icon-[solar--pen-2-linear]"
				title={labels.editProject}
				onClick={onEditProject}
			/>
			<ActionIconButton
				icon="icon-[solar--trash-bin-trash-linear]"
				title={labels.deleteProject}
				variant="danger"
				onClick={onDeleteProject}
				disabled={counts.running > 0}
			/>
		</div>
	);
}
