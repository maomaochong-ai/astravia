import { useEffect, type JSX } from "react";
import { cn } from "./cn";

export interface KnowledgeContextMenuItem {
	label: string;
	icon: string;
	danger?: boolean;
	onClick: () => void;
}

export interface KnowledgeContextMenuViewProps {
	x: number;
	y: number;
	items: KnowledgeContextMenuItem[];
	onClose: () => void;
}

/** Fixed context menu at cursor; click outside / Esc closes. */
export function KnowledgeContextMenuView({
	x,
	y,
	items,
	onClose,
}: KnowledgeContextMenuViewProps): JSX.Element {
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	return (
		<div
			className="fixed inset-0 z-[120]"
			onClick={onClose}
			onContextMenu={(e) => {
				e.preventDefault();
				onClose();
			}}
		>
			<div
				style={{
					left: Math.min(x, window.innerWidth - 180),
					top: Math.min(y, window.innerHeight - 12 - items.length * 34),
				}}
				className="absolute min-w-40 rounded-lg border border-border bg-popover p-1 shadow-xl"
				onClick={(e) => e.stopPropagation()}
			>
				{items.map((item) => (
					<button
						key={item.label}
						type="button"
						onClick={() => {
							item.onClick();
							onClose();
						}}
						className={cn(
							"flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-[12px] transition-colors",
							item.danger ? "text-red-600 hover:bg-red-500/10" : "text-foreground hover:bg-accent",
						)}
					>
						<span className={cn(item.icon, "h-4 w-4", item.danger ? "" : "text-muted-foreground")} />
						{item.label}
					</button>
				))}
			</div>
		</div>
	);
}
