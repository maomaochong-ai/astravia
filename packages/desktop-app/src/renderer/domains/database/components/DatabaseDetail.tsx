import type { JSX } from "react";
import { cn } from "@astravia/ui";

/**
 * 面板通用代码详情块：错误详情 / 测试详情共用的 mono 展示样式唯一来源。
 * 取代各处重复声明的 <pre> 样式（工作区、表单、提示卡内）。
 */
export function DatabaseDetail({ children, className }: { children: string; className?: string }): JSX.Element {
	return (
		<pre
			className={cn(
				"mt-1.5 max-h-24 overflow-auto rounded-md bg-background/60 px-2 py-1 font-mono text-[11px] whitespace-pre-wrap break-all text-foreground/70",
				className,
			)}
		>
			{children}
		</pre>
	);
}
