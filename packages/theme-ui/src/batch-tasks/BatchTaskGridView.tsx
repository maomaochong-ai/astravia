import type { JSX } from "react";
import { BatchTaskCardView } from "./BatchTaskCardView";
import { TASK_COLLAPSE_THRESHOLD } from "./batchTaskUi";
import type { BatchTaskCardCallbacks, BatchTaskCardLabels, BatchTaskGridLabels, BatchTaskViewItem } from "./types";

export interface BatchTaskGridViewProps {
	callbacks: BatchTaskCardCallbacks;
	cardLabels: BatchTaskCardLabels;
	collapsed: boolean;
	countsTotal: number;
	filteredTotal: number;
	hiddenCount: number;
	labels: BatchTaskGridLabels;
	normalizedQuery: string;
	onClearSearch: () => void;
	onSearchChange: (value: string) => void;
	onToggleExpanded: () => void;
	searchQuery: string;
	visibleTasks: readonly BatchTaskViewItem[];
}

export function BatchTaskGridView({
	callbacks,
	cardLabels,
	collapsed,
	countsTotal,
	filteredTotal,
	hiddenCount,
	labels,
	normalizedQuery,
	onClearSearch,
	onSearchChange,
	onToggleExpanded,
	searchQuery,
	visibleTasks,
}: BatchTaskGridViewProps): JSX.Element {
	return (
		<div>
			{countsTotal > 0 && (
				<div className="relative mb-3">
					<span className="icon-[solar--magnifer-linear] pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
					<input
						type="text"
						value={searchQuery}
						onChange={(event) => onSearchChange(event.target.value)}
						placeholder={labels.searchPlaceholder}
						className="h-8 w-full rounded-lg border border-border/40 bg-secondary pl-8 pr-8 text-[12px] text-foreground placeholder:text-muted-foreground/40 outline-none transition-colors focus:border-primary/40 focus:bg-secondary"
					/>
					{searchQuery && (
						<button
							type="button"
							onClick={onClearSearch}
							title={labels.clear}
							className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-accent hover:text-foreground"
						>
							<span className="icon-[solar--close-circle-linear] h-3 w-3" />
						</button>
					)}
				</div>
			)}
			{filteredTotal === 0 ? (
				<div className="flex flex-col items-center gap-1.5 py-6 text-center">
					<span className="icon-[solar--magnifer-linear] h-5 w-5 text-muted-foreground/50" />
					<p className="text-[12px] text-muted-foreground/60">
						{normalizedQuery ? labels.noMatch(searchQuery) : labels.noTasks}
					</p>
				</div>
			) : (
				<div className="grid grid-cols-3 gap-2">
					{visibleTasks.map((task) => (
						<BatchTaskCardView key={task.id} callbacks={callbacks} labels={cardLabels} task={task} />
					))}
				</div>
			)}
			{!normalizedQuery && countsTotal > TASK_COLLAPSE_THRESHOLD && (
				<div className="mt-3 flex justify-center">
					<button
						type="button"
						onClick={onToggleExpanded}
						className="flex items-center gap-1 rounded-full border border-border/50 bg-background/40 px-3 py-1 text-[11px] text-muted-foreground/80 transition-colors hover:border-primary/30 hover:text-foreground"
					>
						<span
							className={
								collapsed
									? "icon-[solar--alt-arrow-down-linear] h-3.5 w-3.5"
									: "icon-[solar--alt-arrow-up-linear] h-3.5 w-3.5"
							}
						/>
						{collapsed ? labels.expandMore(hiddenCount) : labels.collapse}
					</button>
				</div>
			)}
		</div>
	);
}
