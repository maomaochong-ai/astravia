import type { JSX } from "react";

export interface BackgroundTasksBadgeViewProps {
	runningCount: number;
	title: string;
	onClick: () => void;
}

/**
 * 右上角后台任务 badge UI：仅在有运行中任务时由 host 挂载。
 */
export function BackgroundTasksBadgeView({
	runningCount,
	title,
	onClick,
}: BackgroundTasksBadgeViewProps): JSX.Element {
	return (
		<button
			type="button"
			onClick={onClick}
			title={title}
			className="flex h-7 items-center gap-1 rounded-full border border-blue-500/30 bg-blue-500/10 px-2 text-[11px] font-medium text-blue-600 transition-colors hover:bg-blue-500/20 dark:text-blue-400"
		>
			<span className="icon-[solar--refresh-linear] h-3.5 w-3.5 animate-spin" />
			<span>{runningCount}</span>
		</button>
	);
}
