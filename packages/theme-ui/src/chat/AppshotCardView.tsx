import type { JSX, KeyboardEvent } from "react";

export interface AppshotCardViewLabels {
	previewTitle: string;
	thumbnailAlt: string;
	iconAlt: string;
	removeTitle: string;
}

export interface AppshotCardViewProps {
	imageSrc: string | null;
	iconSrc: string | null;
	label: string;
	labels: AppshotCardViewLabels;
	onPreview?: () => void;
	onRemove?: () => void;
}

/**
 * Appshot 组合预览卡 UI：截图缩略图 + 骑边 app 图标 + 文件名。
 */
export function AppshotCardView({
	imageSrc,
	iconSrc,
	label,
	labels,
	onPreview,
	onRemove,
}: AppshotCardViewProps): JSX.Element {
	const onKeyDown = onPreview
		? (e: KeyboardEvent) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onPreview();
				}
			}
		: undefined;

	return (
		<div className="group/appshot relative flex w-fit flex-col items-center">
			<div
				className={imageSrc ? "relative cursor-zoom-in" : "relative"}
				onClick={onPreview}
				onKeyDown={onKeyDown}
				role={imageSrc ? "button" : undefined}
				tabIndex={imageSrc ? 0 : undefined}
				title={imageSrc ? labels.previewTitle : undefined}
			>
				<div className="h-20 w-24 overflow-hidden rounded-xl border border-border/70 bg-muted shadow-sm ring-1 ring-black/5 transition-shadow duration-200 group-hover/appshot:shadow-md dark:ring-white/10">
					{imageSrc ? (
						<img
							src={imageSrc}
							alt={labels.thumbnailAlt}
							className="h-full w-full object-cover transition-transform duration-200 group-hover/appshot:scale-[1.03]"
						/>
					) : (
						<div className="flex h-full w-full items-center justify-center">
							<span className="icon-[mdi--monitor-screenshot] h-6 w-6 text-muted-foreground" />
						</div>
					)}
				</div>
				{iconSrc && (
					<div className="absolute bottom-0 left-1/2 h-8 w-8 -translate-x-1/2 translate-y-1/2 overflow-hidden rounded-[9px] bg-card shadow-md ring-2 ring-background">
						<img src={iconSrc} alt={labels.iconAlt} className="h-full w-full object-cover" />
					</div>
				)}
				{onRemove && (
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							onRemove();
						}}
						className="absolute -top-2 -right-2 z-10 flex items-center justify-center rounded-full border border-border bg-card text-muted-foreground opacity-0 shadow-md transition-all duration-150 group-hover/appshot:opacity-100 hover:scale-110 hover:text-destructive"
						title={labels.removeTitle}
						style={{ height: 20, width: 20 }}
					>
						<span className="icon-[solar--close-circle-linear] h-3.5 w-3.5" />
					</button>
				)}
			</div>
			{label && (
				<span className="mt-4 max-w-[96px] truncate text-center text-[10px] text-muted-foreground leading-tight">
					{label}
				</span>
			)}
		</div>
	);
}
