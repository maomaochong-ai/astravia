import type { JSX } from "react";
import { cn } from "@astravia/ui";

/** 面板通用小节标题（大写小字）：侧栏、信息分区、表单分组共用。 */
export function DatabaseSectionLabel({
	icon,
	children,
	className,
}: {
	icon?: string;
	children: string;
	className?: string;
}): JSX.Element {
	return (
		<div
			className={cn(
				"flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase",
				className,
			)}
		>
			{icon ? <span className={cn("h-3.5 w-3.5 shrink-0", icon)} /> : null}
			{children}
		</div>
	);
}
