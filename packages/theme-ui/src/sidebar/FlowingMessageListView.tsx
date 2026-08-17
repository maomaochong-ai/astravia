import { AnimatePresence, motion } from "motion/react";
import type { JSX } from "react";
import { MESSAGE_CENTER_SPRING } from "./ChatMessageListView";
import { MessageCenterEmptyState } from "./MessageCenterEmptyState";

export interface FlowingMessageListItemView {
	readonly id: number;
	readonly senderName: string;
	readonly projectName: string;
	readonly message: string | null;
	readonly fileCountLabel: string;
	readonly relativeTime: string;
}

export interface FlowingMessageListLabels {
	readonly emptyText: string;
	readonly emptyIcon: string;
	readonly shared: string;
	readonly reject: string;
	readonly accept: string;
	readonly processing: string;
}

export interface FlowingMessageListViewProps {
	readonly labels: FlowingMessageListLabels;
	readonly items: readonly FlowingMessageListItemView[];
	readonly processing: boolean;
	readonly onAccept: (id: number) => void;
	readonly onReject: (id: number) => void;
	/** Host injects Button (or themed control) so visual parity is preserved. */
	readonly renderAction: (args: {
		variant: "outline" | "primary";
		disabled: boolean;
		label: string;
		onClick: () => void;
	}) => JSX.Element;
}

export function FlowingMessageListView({
	labels,
	items,
	processing,
	onAccept,
	onReject,
	renderAction,
}: FlowingMessageListViewProps): JSX.Element {
	if (items.length === 0) {
		return <MessageCenterEmptyState text={labels.emptyText} icon={labels.emptyIcon} />;
	}

	return (
		<div className="flex flex-col gap-1.5 p-3">
			<AnimatePresence initial={false}>
				{items.map((tx, index) => (
					<motion.div
						key={tx.id}
						layout
						initial={{ opacity: 0, y: 8 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, x: -20, height: 0, marginBottom: 0, padding: 0 }}
						transition={{ duration: 0.2, delay: index * 0.03 }}
						className="group rounded-xl border border-border/60 bg-background p-3.5 transition-colors hover:border-primary/40 hover:bg-accent/30"
					>
						<div className="flex items-start gap-3">
							<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
								<span className="icon-[solar--user-circle-linear] h-4 w-4 text-primary" />
							</div>

							<div className="min-w-0 flex-1">
								<p className="text-[12px] leading-snug">
									<span className="font-semibold text-foreground">{tx.senderName}</span>
									<span className="text-muted-foreground">{labels.shared}</span>
									<span className="font-semibold text-foreground">{tx.projectName}</span>
								</p>

								{tx.message && (
									<p className="mt-1.5 line-clamp-2 rounded-lg bg-muted/40 px-2.5 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
										{tx.message}
									</p>
								)}

								<div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground/50">
									<span className="flex items-center gap-1">
										<span className="icon-[solar--documents-minimalistic-linear] h-3 w-3" />
										{tx.fileCountLabel}
									</span>
									<span>{tx.relativeTime}</span>
								</div>

								<div className="mt-2.5 flex gap-2">
									{renderAction({
										variant: "outline",
										disabled: processing,
										label: labels.reject,
										onClick: () => onReject(tx.id),
									})}
									{renderAction({
										variant: "primary",
										disabled: processing,
										label: processing ? labels.processing : labels.accept,
										onClick: () => onAccept(tx.id),
									})}
								</div>
							</div>
						</div>
					</motion.div>
				))}
			</AnimatePresence>
		</div>
	);
}
