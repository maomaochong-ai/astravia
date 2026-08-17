import { Reorder, useDragControls } from "motion/react";
import type { JSX } from "react";

export interface QueueCardItem {
	id: string;
	displayText: string;
}

export interface QueueCardViewLabels {
	empty: string;
	sendNow: string;
	delete: string;
}

export interface QueueCardViewProps {
	items: readonly QueueCardItem[];
	labels: QueueCardViewLabels;
	onReorder: (orderedIds: readonly string[]) => void;
	onSendNow: (id: string) => void;
	onRemove: (id: string) => void;
}

export function QueueCardView({
	items,
	labels,
	onReorder,
	onSendNow,
	onRemove,
}: QueueCardViewProps): JSX.Element {
	// Reorder.Group needs a mutable array of the same value identities.
	const reorderValues = items as QueueCardItem[];

	if (items.length === 0) {
		return (
			<div className="flex flex-1 items-center justify-center px-4 py-6 text-xs text-muted-foreground">
				{labels.empty}
			</div>
		);
	}

	return (
		<div className="flex flex-1 flex-col overflow-y-auto">
			<Reorder.Group
				axis="y"
				values={reorderValues}
				onReorder={(next) => onReorder(next.map((item) => item.id))}
				className="flex flex-col p-1.5"
			>
				{reorderValues.map((item) => (
					<QueueItemRow
						key={item.id}
						item={item}
						sendNowTitle={labels.sendNow}
						deleteTitle={labels.delete}
						onSendNow={onSendNow}
						onRemove={onRemove}
					/>
				))}
			</Reorder.Group>
		</div>
	);
}

function QueueItemRow({
	item,
	sendNowTitle,
	deleteTitle,
	onSendNow,
	onRemove,
}: {
	item: QueueCardItem;
	sendNowTitle: string;
	deleteTitle: string;
	onSendNow: (id: string) => void;
	onRemove: (id: string) => void;
}): JSX.Element {
	const dragControls = useDragControls();

	return (
		<Reorder.Item
			value={item}
			dragListener={false}
			dragControls={dragControls}
			initial={{ opacity: 0, height: 0 }}
			animate={{ opacity: 1, height: "auto" }}
			exit={{ opacity: 0, height: 0 }}
			transition={{ duration: 0.15 }}
			className="group flex items-center gap-1.5 rounded-md px-1.5 py-1 transition-colors hover:bg-muted/30"
		>
			<button
				type="button"
				onPointerDown={(e) => dragControls.start(e)}
				className="flex shrink-0 cursor-grab touch-none items-center text-muted-foreground/50 transition-colors hover:text-muted-foreground active:cursor-grabbing"
			>
				<span className="icon-[solar--hamburger-menu-linear] text-sm" />
			</button>
			<button
				type="button"
				onClick={() => onSendNow(item.id)}
				title={sendNowTitle}
				className="min-w-0 flex-1 truncate text-left text-[12px] leading-snug text-foreground"
			>
				{item.displayText}
			</button>
			<button
				type="button"
				onClick={() => onRemove(item.id)}
				title={deleteTitle}
				aria-label={deleteTitle}
				className="flex shrink-0 items-center text-muted-foreground/50 opacity-0 transition-all hover:text-destructive group-hover:opacity-100"
			>
				<span className="icon-[solar--trash-bin-trash-linear] text-sm" />
			</button>
		</Reorder.Item>
	);
}
