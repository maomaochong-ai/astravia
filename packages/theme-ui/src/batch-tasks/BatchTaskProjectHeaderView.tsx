import { useEffect, useState, type JSX } from "react";
import type { BatchProjectCountsView, BatchTaskProjectHeaderLabels } from "./types";

/** Matches desktop SIDEBAR_NARROW_BREAKPOINT for badge visibility. */
const NARROW_BREAKPOINT = 640;

export interface BatchTaskProjectHeaderViewProps {
	counts: BatchProjectCountsView;
	filteredTotal: number;
	labels: BatchTaskProjectHeaderLabels;
	normalizedQuery: string;
	onResetFailed: () => void;
	projectName: string;
}

export function BatchTaskProjectHeaderView({
	counts,
	filteredTotal,
	labels,
	normalizedQuery,
	onResetFailed,
	projectName,
}: BatchTaskProjectHeaderViewProps): JSX.Element {
	const [narrow, setNarrow] = useState(() =>
		typeof window !== "undefined" ? window.innerWidth < NARROW_BREAKPOINT : false,
	);

	useEffect(() => {
		const onResize = (): void => setNarrow(window.innerWidth < NARROW_BREAKPOINT);
		onResize();
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, []);

	return (
		<>
			<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-inset ring-primary/20">
				<span className="icon-[solar--folder-with-files-linear] h-[18px] w-[18px] text-primary" />
			</div>
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<h3 className="truncate text-[15px] font-semibold tracking-tight text-foreground">{projectName}</h3>
					{!narrow && (
						<span className="inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded-full bg-accent/50 px-2 text-[10px] text-muted-foreground/70">
							{normalizedQuery
								? labels.matchCount(filteredTotal, counts.total)
								: labels.taskCount(counts.total)}
						</span>
					)}
				</div>
				<p className="mt-1 flex items-center gap-1 truncate text-[11px] text-muted-foreground/60">
					<span>
						{labels.completedOf(counts.completed, counts.total)}
						{counts.running > 0 && labels.runningSuffix(counts.running)}
						{counts.paused > 0 && labels.pausedSuffix(counts.paused)}
					</span>
					{counts.failed > 0 && (
						<>
							<span>·</span>
							<button
								type="button"
								onClick={onResetFailed}
								title={labels.resetFailedHint(counts.failed)}
								className="inline-flex h-4 items-center rounded-full bg-destructive/10 px-1.5 text-[10px] font-medium leading-none text-destructive transition-colors hover:bg-destructive/20"
							>
								{labels.failedReset(counts.failed)}
							</button>
						</>
					)}
				</p>
			</div>
		</>
	);
}
