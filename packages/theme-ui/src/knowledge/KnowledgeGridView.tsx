import type { JSX } from "react";
import { getColoredFileIcon } from "./coloredFileIcons";
import { cn } from "./cn";
import { KnowledgeEmptyState, StatusBadge, type KnowledgeViewProps } from "./KnowledgeViewShared";
import { knowledgeDirItemCount } from "./types";
import { useMarqueeSelection } from "./useMarqueeSelection";

/**
 * Mac Finder-style file grid. Selection, marquee, double-click open, context menu.
 */
export function KnowledgeGridView({
	nodes,
	searching,
	selectedIds,
	statusFor,
	onItemClick,
	onOpen,
	onContextMenu,
	onSelectIds,
	onClearSelection,
	labels,
}: KnowledgeViewProps): JSX.Element {
	const { scrollRef, marquee, onMouseDown } = useMarqueeSelection({
		selectedIds,
		onSelectIds,
		onClearSelection,
	});

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: marquee selection; keyboard via Esc/arrows
		<div
			ref={scrollRef}
			className="relative min-h-0 flex-1 overflow-y-auto"
			onMouseDown={onMouseDown}
		>
			{nodes.length === 0 ? (
				<KnowledgeEmptyState searching={searching} labels={labels} />
			) : (
				<div className="relative min-h-full">
					<div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-1 py-3">
						{nodes.map((node) => {
							const isDir = node.type === "directory";
							const selected = selectedIds.has(node.id);
							const status = statusFor(node);
							const unprocessed = status === "unprocessed";
							return (
								<button
									key={node.id}
									type="button"
									data-knode
									data-knode-id={node.id}
									onClick={(e) => onItemClick(node, e)}
									onDoubleClick={() => onOpen(node)}
									onContextMenu={(e) => {
										e.preventDefault();
										onContextMenu(node, e);
									}}
									className="group/cell flex w-full flex-col items-center gap-1.5 rounded-lg px-2 py-3"
								>
									<span
										className={cn(
											"relative flex h-[72px] w-[72px] items-center justify-center rounded-2xl transition-colors",
											selected ? "bg-foreground/10" : "group-hover/cell:bg-foreground/[0.04]",
										)}
									>
										<span
											className={cn(
												getColoredFileIcon(node.name, isDir),
												"h-14 w-14 shrink-0",
												unprocessed && "opacity-40 grayscale",
											)}
										/>
										{status && status !== "processed" && (
											<StatusBadge status={status} labels={labels} />
										)}
									</span>
									<span className="line-clamp-2 w-full text-center text-[12px] leading-[1.55]">
										<span
											className={cn(
												"break-all [-webkit-box-decoration-break:clone] [box-decoration-break:clone]",
												selected
													? "rounded bg-primary px-1.5 py-0.5 text-primary-foreground"
													: "text-foreground",
											)}
										>
											{node.name}
										</span>
									</span>
									{isDir && (
										<span className="text-[10px] tabular-nums text-muted-foreground/45">
											{labels.itemCount(knowledgeDirItemCount(node))}
										</span>
									)}
								</button>
							);
						})}
					</div>
					{marquee && (
						<div
							className="pointer-events-none absolute z-10 rounded-sm border border-primary/50 bg-primary/10"
							style={{
								left: marquee.left,
								top: marquee.top,
								width: marquee.width,
								height: marquee.height,
							}}
						/>
					)}
				</div>
			)}
		</div>
	);
}
