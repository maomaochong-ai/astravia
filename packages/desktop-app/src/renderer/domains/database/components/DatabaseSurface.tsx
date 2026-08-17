import type { JSX, ReactNode } from "react";
import { cn } from "@astravia/ui";

/**
 * 面板软填充表面：无边框圆角容器，信息分区与开关行共用，
 * 保证「减少线条感」的视觉语言只声明一次。
 */
export function DatabaseSurface({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}): JSX.Element {
	return <div className={cn("rounded-xl bg-muted/35", className)}>{children}</div>;
}
