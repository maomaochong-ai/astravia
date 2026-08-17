import type { JSX } from "react";

export interface RequestHistoryItem {
	filename: string;
	path: string;
	timeLabel: string;
	model: string;
	tokensLabel: string;
}

export interface RequestHistorySubTabViewLabels {
	noSession: string;
	loading: string;
	requestCount: string;
	refresh: string;
	empty: string;
	showInFolder: string;
}

export interface RequestHistorySubTabViewProps {
	hasSession: boolean;
	loading: boolean;
	files: readonly RequestHistoryItem[];
	labels: RequestHistorySubTabViewLabels;
	onRefresh: () => void;
	onPreview: (file: RequestHistoryItem) => void;
	onShowInFolder: (path: string) => void;
}

export function RequestHistorySubTabView({
	hasSession,
	loading,
	files,
	labels,
	onRefresh,
	onPreview,
	onShowInFolder,
}: RequestHistorySubTabViewProps): JSX.Element {
	if (!hasSession) {
		return (
			<div className="flex flex-1 items-center justify-center p-4 text-[12px] text-muted-foreground">
				{labels.noSession}
			</div>
		);
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			{/* Header */}
			<div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-1">
				<span className="text-[11px] text-muted-foreground">
					{loading ? labels.loading : labels.requestCount}
				</span>
				<button
					type="button"
					onClick={onRefresh}
					className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
					title={labels.refresh}
				>
					<span className="icon-[mdi--refresh] h-3.5 w-3.5" />
				</button>
			</div>

			{/* List */}
			<div className="flex-1 overflow-y-auto">
				{files.length === 0 && !loading && (
					<div className="p-4 text-center text-[12px] text-muted-foreground">{labels.empty}</div>
				)}
				{files.map((file) => (
					<div
						key={file.filename}
						className="flex items-center gap-2 border-b border-border px-3 py-2 transition-colors hover:bg-secondary/50"
					>
						<button
							type="button"
							onClick={() => onPreview(file)}
							className="flex min-w-0 flex-1 items-center gap-3 text-left"
						>
							<span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
								{file.timeLabel}
							</span>
							<span className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground">
								{file.model}
							</span>
							<span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
								{file.tokensLabel}
							</span>
						</button>
						<button
							type="button"
							onClick={() => onShowInFolder(file.path)}
							className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
							title={labels.showInFolder}
						>
							<span className="icon-[mdi--folder-open-outline] h-3.5 w-3.5" />
						</button>
					</div>
				))}
			</div>
		</div>
	);
}
