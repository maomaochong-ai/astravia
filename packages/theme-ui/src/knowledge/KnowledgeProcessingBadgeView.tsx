import type { JSX } from "react";

export interface KnowledgeProcessingBadgeViewProps {
	label: string;
}

/**
 * 顶栏标题右侧徽标：知识库后台加工（建立索引）进行中时显示，带 spin 动画。
 * 空闲时由 host container 渲染 null，本 View 仅负责 badge UI。
 */
export function KnowledgeProcessingBadgeView({ label }: KnowledgeProcessingBadgeViewProps): JSX.Element {
	return (
		<span className="no-drag inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
			<span className="icon-[mdi--loading] h-3.5 w-3.5 animate-spin" />
			{label}
		</span>
	);
}
