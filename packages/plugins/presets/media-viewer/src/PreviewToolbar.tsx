import type { JSX, ReactNode } from "react";

// 底部居中浮动的胶囊控制栏：半透明 + 毛玻璃，宽度自适应内容，固定不可拖拽
export function PreviewToolbar({ children }: { children: ReactNode }): JSX.Element {
	return (
		<div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center">
			<div className="pointer-events-auto flex items-center gap-1 rounded-full border border-[var(--border)]/60 bg-[var(--background)]/70 px-2 py-1 shadow-lg backdrop-blur-md">
				{children}
			</div>
		</div>
	);
}
