import type { JSX, ReactNode } from "react";
import { cn } from "@astravia/ui";
import { DatabaseBadge } from "./DatabaseBadge";
import { DatabaseSectionLabel } from "./DatabaseSectionLabel";

interface DatabaseListHeaderProps {
	/** 列表/树标题（如「连接」）。 */
	label: string;
	/** 计数徽章；不传或为 0 时不显示。 */
	count?: number;
	/** 头部右侧动作（如浮层抽屉的折叠按钮）。 */
	action?: ReactNode;
	className?: string;
}

/**
 * 连接列表/连接树头部唯一定义（B2.6-U U2 列表/树头部收敛）：
 * section label + 计数徽章 + 可选动作，设置页列表、标签页树与浮层抽屉共用。
 */
export function DatabaseListHeader({ label, count, action, className }: DatabaseListHeaderProps): JSX.Element {
	return (
		<div className={cn("flex items-center justify-between px-4 pt-3.5 pb-2", className)}>
			<DatabaseSectionLabel>{label}</DatabaseSectionLabel>
			<div className="flex shrink-0 items-center gap-1.5">
				{count !== undefined && count > 0 ? <DatabaseBadge variant="count">{count}</DatabaseBadge> : null}
				{action}
			</div>
		</div>
	);
}
