import type { JSX, ReactNode } from "react";
import { cn } from "@astravia/ui";
import { motion } from "motion/react";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

interface DatabaseWorkspaceHeaderProps {
	/**
	 * page：页面级大标题（/database 路由与设置页数据库 tab 的连接管理页）。
	 * toolbar：活动面板「数据库」标签页的紧凑工具条（去重复大标题，聚焦工作区操作）。
	 */
	variant: "page" | "toolbar";
	/** page 变体标题（如「数据库」）。 */
	title?: string;
	/** page 变体副标题。 */
	subtitle?: string;
	/** toolbar 变体左侧上下文（当前连接、状态等），占满剩余宽度。 */
	context?: ReactNode;
	/** 右侧操作区（按钮组）。 */
	actions?: ReactNode;
	className?: string;
}

/**
 * 数据库工作区头部唯一定义（B2.6-U U1 头部收敛）：
 * 设置页/路由用 page 大标题，活动面板标签页用 toolbar 紧凑工具条，
 * 两处不再各自声明一套头部样式。
 */
export function DatabaseWorkspaceHeader({
	variant,
	title,
	subtitle,
	context,
	actions,
	className,
}: DatabaseWorkspaceHeaderProps): JSX.Element {
	if (variant === "toolbar") {
		return (
			<header className={cn("flex h-10 shrink-0 items-center gap-2 border-b border-border/40 px-3", className)}>
				{context ? <div className="flex min-w-0 flex-1 items-center gap-2">{context}</div> : null}
				{actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
			</header>
		);
	}
	return (
		<header className={cn("flex shrink-0 items-end justify-between gap-4 px-8 pb-4 pt-7", className)}>
			<motion.div
				initial={{ opacity: 0, y: -8 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.45, ease: EASE_OUT }}
				className="min-w-0"
			>
				{title ? (
					<h1 className="truncate text-[24px] font-bold leading-tight tracking-tight text-foreground">{title}</h1>
				) : null}
				{subtitle ? <p className="mt-1 truncate text-[12px] text-muted-foreground/60">{subtitle}</p> : null}
			</motion.div>
			{actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
		</header>
	);
}
