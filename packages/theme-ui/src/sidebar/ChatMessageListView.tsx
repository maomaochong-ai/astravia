import { motion } from "motion/react";
import type { JSX } from "react";
import { MessageCenterEmptyState } from "./MessageCenterEmptyState";

export const MESSAGE_CENTER_SPRING = { type: "spring" as const, stiffness: 420, damping: 32 };

export interface ChatMessageListItemView {
	readonly flowingId: number;
	readonly title: string;
	readonly preview: string;
	readonly unreadCount: number;
	readonly relativeTime: string | null;
}

export interface ChatMessageListViewProps {
	readonly emptyText: string;
	readonly emptyIcon: string;
	readonly items: readonly ChatMessageListItemView[];
	readonly onSelect: (flowingId: number) => void;
}

export function ChatMessageListView({
	emptyText,
	emptyIcon,
	items,
	onSelect,
}: ChatMessageListViewProps): JSX.Element {
	if (items.length === 0) {
		return <MessageCenterEmptyState text={emptyText} icon={emptyIcon} />;
	}

	return (
		<div className="flex flex-col gap-1.5 p-3">
			{items.map((item) => (
				<motion.button
					key={item.flowingId}
					layout
					initial={{ opacity: 0, y: 8 }}
					animate={{ opacity: 1, y: 0 }}
					transition={MESSAGE_CENTER_SPRING}
					type="button"
					onClick={() => onSelect(item.flowingId)}
					className="group rounded-xl border border-border/60 bg-background p-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/30"
				>
					<div className="flex items-start gap-3">
						<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
							<span className="icon-[solar--chat-round-line-linear] h-4 w-4 text-primary" />
						</div>
						<div className="min-w-0 flex-1">
							<div className="flex items-center justify-between gap-2">
								<p className="truncate text-[12px] font-semibold text-foreground">{item.title}</p>
								<span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
									{item.unreadCount}
								</span>
							</div>
							<p className="mt-1 truncate text-[11px] text-muted-foreground">{item.preview}</p>
							{item.relativeTime && (
								<p className="mt-1 text-[10px] text-muted-foreground/50">{item.relativeTime}</p>
							)}
						</div>
					</div>
				</motion.button>
			))}
		</div>
	);
}
