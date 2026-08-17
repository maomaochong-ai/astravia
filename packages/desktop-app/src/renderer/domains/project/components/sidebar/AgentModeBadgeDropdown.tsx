import { AGENT_MODES, AGENT_MODE_ICONS } from "@shared/components/AgentModeSwitcher";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@shared/components/ui/dropdown-menu";
import { useAgentMode } from "@shared/hooks/useAgentMode";
import { cn } from "@shared/lib/utils";
import { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * 侧边栏顶栏工作模式徽章：点击展开下拉菜单切换 Work/Coding。
 * 按父级 actions 区可用宽度自适应：空间够显示 icon+文案+箭头，不够则仅 icon，
 * 折叠按钮始终不被挤出/裁切。
 */
export function AgentModeBadgeDropdown({ className }: { className?: string }): JSX.Element {
	const { t } = useTranslation("settings");
	const { agentMode, setAgentMode } = useAgentMode();
	const modeLabel = t(`agentMode.${agentMode}`);
	const rootRef = useRef<HTMLDivElement>(null);
	const measureRef = useRef<HTMLSpanElement>(null);
	const [compact, setCompact] = useState(false);

	useLayoutEffect(() => {
		const root = rootRef.current;
		const measure = measureRef.current;
		if (!root || !measure) return;

		// 直接挂在 theme SidebarTopBar 的 actions flex 容器上
		const parent = root.parentElement;
		if (!parent) return;

		const update = (): void => {
			const fullWidth = measure.offsetWidth;
			if (fullWidth <= 0) return;

			const style = getComputedStyle(parent);
			const gap = Number.parseFloat(style.columnGap || style.gap || "0") || 0;
			let siblingsWidth = 0;
			let siblingCount = 0;
			for (const child of parent.children) {
				if (child === root) continue;
				siblingsWidth += (child as HTMLElement).getBoundingClientRect().width;
				siblingCount += 1;
			}
			const available = parent.clientWidth - siblingsWidth - gap * siblingCount;
			// 进入 compact 紧、退出略松，避免临界宽度来回抖
			setCompact((prev) => (prev ? available + 4 < fullWidth : available + 1 < fullWidth));
		};

		const ro = new ResizeObserver(update);
		ro.observe(parent);
		update();
		return () => ro.disconnect();
	}, [modeLabel]);


	return (
		<div ref={rootRef} className="relative min-w-0">
			{/* 离屏测量完整徽章自然宽度 */}
			<span
				ref={measureRef}
				aria-hidden
				className="pointer-events-none absolute -z-10 flex h-5 items-center gap-1 whitespace-nowrap px-2 text-[10px] font-medium opacity-0"
			>
				<span className={cn(AGENT_MODE_ICONS[agentMode], "h-3 w-3 shrink-0")} />
				<span>{modeLabel}</span>
				<span className="icon-[solar--alt-arrow-down-linear] h-3 w-3 shrink-0" />
			</span>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						data-compact={compact ? "true" : undefined}
						title={compact ? modeLabel : t("agentMode.title")}
						aria-label={t("agentMode.title")}
						className={cn(
							"no-drag flex h-5 items-center justify-center font-medium text-foreground transition-colors hover:bg-accent/80",
							compact
								? "w-5 shrink-0 rounded-md bg-accent"
								: "max-w-full min-w-0 gap-1 rounded-full bg-accent px-2 text-[10px]",
							className,
						)}
					>
						<span className={cn(AGENT_MODE_ICONS[agentMode], "h-3 w-3 shrink-0")} aria-hidden />
						{!compact && (
							<>
								<span className="min-w-0 truncate">{modeLabel}</span>
								<span
									className="icon-[solar--alt-arrow-down-linear] h-3 w-3 shrink-0 opacity-70"
									aria-hidden
								/>
							</>
						)}
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="min-w-36">
					{AGENT_MODES.map((mode) => {
						const active = mode === agentMode;
						return (
							<DropdownMenuItem
								key={mode}
								onSelect={() => void setAgentMode(mode)}
								className="gap-2 text-[12px]"
							>
								<span className={cn(AGENT_MODE_ICONS[mode], "h-4 w-4 shrink-0")} />
								<span className="flex-1">{t(`agentMode.${mode}`)}</span>
								{active && (
									<span className="icon-[solar--check-circle-bold] h-4 w-4 shrink-0 text-primary" />
								)}
							</DropdownMenuItem>
						);
					})}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
