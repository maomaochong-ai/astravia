import { AnimatePresence, motion } from "motion/react";
import { useRef, useState, type JSX } from "react";

const COMPACT_VISIBLE_COUNT = 5;

export interface TodoCardItem {
	id: number;
	content: string;
	status: "pending" | "in_progress" | "done";
}

export interface TodoCardLabels {
	allDone: string;
	pending: string;
	viewMore: string;
	collapse: string;
	/** Host formats remaining count into full expand label. */
	expandRemaining: (hiddenCount: number) => string;
}

export interface TodoCardProps {
	items: readonly TodoCardItem[];
	/** Compact mode for inline display in message list */
	compact?: boolean;
	/** When provided in compact mode, replaces expand/collapse with view-more that calls this */
	onViewMore?: () => void;
	labels: TodoCardLabels;
}

export function TodoCard({
	items,
	compact = false,
	onViewMore,
	labels,
}: TodoCardProps): JSX.Element | null {
	if (items.length === 0) return null;

	const doneCount = items.filter((i) => i.status === "done").length;
	const total = items.length;
	const allDone = doneCount === total;

	if (compact) {
		return (
			<CompactTodoCard
				items={items}
				doneCount={doneCount}
				total={total}
				allDone={allDone}
				onViewMore={onViewMore}
				labels={labels}
			/>
		);
	}

	return (
		<div className="flex flex-1 flex-col overflow-y-auto">
			<div className="border-b border-border px-4 py-3">
				<ProgressHeader doneCount={doneCount} total={total} allDone={allDone} labels={labels} />
				<ProgressBar doneCount={doneCount} total={total} height="h-1.5" />
			</div>
			<ul className="flex flex-col p-1.5">
				{items.map((item) => (
					<TodoItemRow key={item.id} item={item} size="md" />
				))}
			</ul>
		</div>
	);
}

function CompactTodoCard({
	items,
	doneCount,
	total,
	allDone,
	onViewMore,
	labels,
}: {
	items: readonly TodoCardItem[];
	doneCount: number;
	total: number;
	allDone: boolean;
	onViewMore?: () => void;
	labels: TodoCardLabels;
}): JSX.Element {
	const [expanded, setExpanded] = useState(false);
	const canCollapse = total > COMPACT_VISIBLE_COUNT;
	const hiddenCount = total - COMPACT_VISIBLE_COUNT;

	const sliceStartRef = useRef(-1);
	const inProgressIdx = items.findIndex((i) => i.status === "in_progress");
	const prev = sliceStartRef.current;
	const needsRecalc =
		prev === -1 ||
		(inProgressIdx >= 0 && (inProgressIdx < prev || inProgressIdx >= prev + COMPACT_VISIBLE_COUNT)) ||
		prev > total - COMPACT_VISIBLE_COUNT;
	if (needsRecalc) {
		const idealStart = inProgressIdx >= 0 ? inProgressIdx - 1 : total - COMPACT_VISIBLE_COUNT;
		sliceStartRef.current = Math.max(0, Math.min(idealStart, total - COMPACT_VISIBLE_COUNT));
	}
	const sliceStart = sliceStartRef.current;
	const visibleItems = canCollapse && !expanded ? items.slice(sliceStart, sliceStart + COMPACT_VISIBLE_COUNT) : items;

	return (
		<div>
			<ProgressHeader doneCount={doneCount} total={total} allDone={allDone} labels={labels} />
			<ProgressBar doneCount={doneCount} total={total} height="h-1" animated />
			<ul className="mt-1.5 flex flex-col">
				<AnimatePresence initial={false}>
					{visibleItems.map((item) => (
						<TodoItemRow key={item.id} item={item} size="sm" />
					))}
				</AnimatePresence>
			</ul>
			{canCollapse &&
				(onViewMore ? (
					<button
						type="button"
						onClick={onViewMore}
						className="mt-1.5 flex w-full items-center justify-center gap-1 rounded-md py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
					>
						<span className="icon-[solar--arrow-right-linear] text-sm" />
						{labels.viewMore}
					</button>
				) : (
					<button
						type="button"
						onClick={() => setExpanded((v) => !v)}
						className="mt-1.5 flex w-full items-center justify-center gap-1 rounded-md py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
					>
						<span
							className={`${expanded ? "icon-[solar--alt-arrow-up-linear]" : "icon-[solar--alt-arrow-down-linear]"} text-sm`}
						/>
						{expanded ? labels.collapse : labels.expandRemaining(hiddenCount)}
					</button>
				))}
		</div>
	);
}

function ProgressHeader({
	doneCount,
	total,
	allDone,
	labels,
}: {
	doneCount: number;
	total: number;
	allDone: boolean;
	labels: TodoCardLabels;
}): JSX.Element {
	return (
		<div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
			<span>{allDone ? labels.allDone : labels.pending}</span>
			<span>
				{doneCount}/{total}
			</span>
		</div>
	);
}

function ProgressBar({
	doneCount,
	total,
	height,
	animated,
}: {
	doneCount: number;
	total: number;
	height: string;
	animated?: boolean;
}): JSX.Element {
	const pct = total > 0 ? (doneCount / total) * 100 : 0;
	return (
		<div className={`${height} overflow-hidden rounded-full bg-muted/50`}>
			{animated ? (
				<motion.div
					className={`${height} rounded-full bg-primary`}
					initial={{ width: 0 }}
					animate={{ width: `${pct}%` }}
					transition={{ duration: 0.4, ease: "easeOut" }}
				/>
			) : (
				<div
					className={`${height} rounded-full bg-primary transition-all duration-500 ease-out`}
					style={{ width: `${pct}%` }}
				/>
			)}
		</div>
	);
}

function TodoItemRow({ item, size }: { item: TodoCardItem; size: "sm" | "md" }): JSX.Element {
	const isDone = item.status === "done";
	const isInProgress = item.status === "in_progress";
	const iconSize = size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5";
	const iconRadius = size === "sm" ? "rounded-[6px]" : "rounded-[7px]";
	const textSize = size === "sm" ? "text-[11px] leading-snug" : "text-[12px] leading-snug";
	const padding = size === "sm" ? "px-1.5 py-0.5" : "px-2 py-1";
	const checkGlyph = size === "sm" ? "text-[8px]" : "text-[9px]";

	return (
		<motion.li
			initial={{ opacity: 0, height: 0 }}
			animate={{ opacity: 1, height: "auto" }}
			exit={{ opacity: 0, height: 0 }}
			transition={{ duration: 0.15 }}
			className={`flex items-start gap-1.5 rounded-md ${padding} transition-colors hover:bg-muted/30`}
		>
			<div className="mt-px shrink-0">
				{isDone ? (
					<motion.div
						initial={{ scale: 0 }}
						animate={{ scale: 1 }}
						transition={{ type: "spring", stiffness: 500, damping: 25 }}
						className={`flex ${iconSize} ${iconRadius} items-center justify-center bg-primary text-primary-foreground shadow-[0_2px_6px_-2px_var(--primary)]`}
						style={{ borderRadius: size === "sm" ? "30%" : "32%" }}
					>
						<span className={`icon-[mdi--check] ${checkGlyph}`} />
					</motion.div>
				) : isInProgress ? (
					<div
						className={`flex ${iconSize} ${iconRadius} items-center justify-center border border-primary/50 text-primary`}
						style={{ borderRadius: size === "sm" ? "30%" : "32%" }}
					>
						<span className={`icon-[solar--refresh-linear] animate-spin ${checkGlyph}`} />
					</div>
				) : (
					<div
						className={`${iconSize} ${iconRadius} border border-muted-foreground/30`}
						style={{ borderRadius: size === "sm" ? "30%" : "32%" }}
					/>
				)}
			</div>
			<span
				className={`${textSize} transition-all duration-300 ${
					isDone ? "text-muted-foreground line-through decoration-muted-foreground/50" : "text-foreground"
				}`}
			>
				{item.content}
			</span>
		</motion.li>
	);
}
