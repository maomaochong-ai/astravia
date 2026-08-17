import { AnimatePresence, motion } from "motion/react";
import type { JSX, ReactNode } from "react";

export interface ToolCallBlockViewProps {
	canExpand: boolean;
	expanded: boolean;
	exportMode: boolean;
	panelId?: string;
	icon: string;
	iconColorClass: string;
	mcpServer?: string | null;
	name: string;
	detail?: string | null;
	isPending: boolean;
	currentPhase?: string | null;
	showBadge: boolean;
	badgeLabel?: string | null;
	/** Expanded body content (meta + tool-specific views). */
	body: ReactNode;
	/** When set, replaces the whole default chrome (plugin slot). */
	pluginSlot?: ReactNode;
	onToggle: () => void;
}

/**
 * Tool call row + expandable result shell. Host injects tool-specific body / plugin slots.
 */
export function ToolCallBlockView({
	canExpand,
	expanded,
	exportMode,
	panelId,
	icon,
	iconColorClass,
	mcpServer,
	name,
	detail,
	isPending,
	currentPhase,
	showBadge,
	badgeLabel,
	body,
	pluginSlot,
	onToggle,
}: ToolCallBlockViewProps): JSX.Element {
	if (pluginSlot) return <>{pluginSlot}</>;

	return (
		<div className="group min-w-0">
			<button
				type="button"
				onClick={() => canExpand && onToggle()}
				data-export-toggle={canExpand ? panelId : undefined}
				aria-expanded={expanded}
				className={`inline-flex max-w-full items-center gap-2 rounded-lg px-2 py-1 text-left transition-colors ${canExpand ? "hover:bg-muted/60 cursor-pointer" : "cursor-default"}`}
			>
				<div className="flex min-w-0 flex-1 items-center gap-1.5 text-[12px]">
					<span className={`${icon} h-3.5 w-3.5 shrink-0 ${iconColorClass}`} />
					{mcpServer && (
						<span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[10px] font-medium text-muted-foreground/50">
							{mcpServer}
						</span>
					)}
					<span className="shrink-0 font-medium text-foreground/70">{name}</span>
					{detail && (
						<span className={`min-w-0 truncate text-muted-foreground/40 ${isPending ? "tool-call-shimmer-text" : ""}`}>
							{detail}
						</span>
					)}
					{isPending && currentPhase && (
						<span className="tool-call-shimmer-text min-w-0 truncate italic text-muted-foreground/50">
							— {currentPhase}
						</span>
					)}
				</div>

				{showBadge && badgeLabel && (
					<span
						className={`shrink-0 rounded px-1 py-0.5 text-[10px] tabular-nums ${
							isPending ? "bg-primary/10 text-primary/70" : "bg-muted text-muted-foreground/60"
						}`}
					>
						{badgeLabel}
					</span>
				)}

				{canExpand && (
					<span
						className={`icon-[mdi--chevron-right] h-3 w-3 shrink-0 text-muted-foreground/30 transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
					/>
				)}
			</button>

			<AnimatePresence initial={false}>
				{(expanded || exportMode) && canExpand && (
					<motion.div
						id={panelId}
						data-export-collapse-panel={exportMode ? "" : undefined}
						hidden={exportMode && !expanded}
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
						className="min-w-0 overflow-hidden"
					>
						<div className="ml-2 min-w-0 border-l-2 border-muted-foreground/10 pl-4 pt-1 pb-2">{body}</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}
