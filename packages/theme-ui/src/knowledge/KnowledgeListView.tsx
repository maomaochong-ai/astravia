import type { JSX } from "react";
import { getColoredFileIcon } from "./coloredFileIcons";
import { cn } from "./cn";
import { KnowledgeEmptyState, StatusBadge, type KnowledgeViewProps } from "./KnowledgeViewShared";
import { formatFileSize, knowledgeDirItemCount } from "./types";
import { useMarqueeSelection } from "./useMarqueeSelection";

/**
 * Mac Finder-style file list: icon + name + size / item count.
 */
export function KnowledgeListView({
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
					<div className="flex flex-col py-2">
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
									className={cn(
										"group/row flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors",
										selected ? "bg-primary/10" : "hover:bg-foreground/[0.04]",
									)}
								>
									<span className="relative flex h-9 w-9 shrink-0 items-center justify-center">
										<span
											className={cn(
												getColoredFileIcon(node.name, isDir),
												"h-6 w-6 shrink-0",
												unprocessed && "opacity-40 grayscale",
											)}
										/>
										{status && status !== "processed" && (
											<StatusBadge status={status} labels={labels} />
										)}
									</span>
									<span
										className={cn(
											"min-w-0 flex-1 truncate text-[13px] leading-5",
											selected ? "text-foreground" : "text-foreground/90",
										)}
									>
										{node.name}
									</span>
									<span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/55">
										{isDir
											? labels.itemCount(knowledgeDirItemCount(node))
											: formatFileSize(node.size)}
									</span>
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
