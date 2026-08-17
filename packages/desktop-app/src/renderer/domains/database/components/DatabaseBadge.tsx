import type { JSX } from "react";
import { cn } from "@astravia/ui";

/**
 * 面板通用胶囊徽章：计数、类型等小标签的唯一样式来源。
 * 取代各处重复声明的 rounded-full 胶囊（侧栏计数 / 详情类型等）。
 */
export function DatabaseBadge({
	children,
	className,
	variant = "muted",
}: {
	children: React.ReactNode;
	className?: string;
	variant?: "muted" | "count";
}): JSX.Element {
	return (
		<span
			className={cn(
				"shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
				variant === "count" && "bg-background px-1.5 py-0.5 text-[10.5px] text-muted-foreground",
				variant === "muted" && "bg-muted text-muted-foreground",
				className,
			)}
		>
			{children}
		</span>
	);
}
