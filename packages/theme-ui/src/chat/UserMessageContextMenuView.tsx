import { motion } from "motion/react";
import { useEffect, useRef, type JSX } from "react";

export interface UserMessageContextMenuViewLabels {
	copy: string;
	delete: string;
	edit: string;
}

export interface UserMessageContextMenuViewProps {
	canCopy: boolean;
	canDelete: boolean;
	canEdit: boolean;
	labels: UserMessageContextMenuViewLabels;
	onClose: () => void;
	onCopy: () => void;
	onDelete: () => void;
	onEdit: () => void;
	x: number;
	y: number;
}

const menuItemBaseClass =
	"flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-40";
const menuItemClass = `${menuItemBaseClass} text-foreground hover:bg-accent`;
const destructiveMenuItemClass = `${menuItemBaseClass} font-semibold text-destructive hover:bg-destructive/10 hover:text-destructive`;

export function UserMessageContextMenuView({
	canCopy,
	canDelete,
	canEdit,
	labels,
	onClose,
	onCopy,
	onDelete,
	onEdit,
	x,
	y,
}: UserMessageContextMenuViewProps): JSX.Element {
	const menuRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		function handlePointerDown(event: MouseEvent): void {
			if (menuRef.current && !menuRef.current.contains(event.target as Node)) onClose();
		}
		document.addEventListener("mousedown", handlePointerDown);
		return () => document.removeEventListener("mousedown", handlePointerDown);
	}, [onClose]);

	useEffect(() => {
		function handleKeyDown(event: KeyboardEvent): void {
			if (event.key === "Escape") onClose();
		}
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [onClose]);

	return (
		<motion.div
			ref={menuRef}
			initial={{ opacity: 0, scale: 0.95 }}
			animate={{ opacity: 1, scale: 1 }}
			transition={{ duration: 0.12, ease: [0.25, 0.1, 0.25, 1] }}
			className="fixed z-[1000] w-[170px] overflow-hidden rounded-lg border border-border bg-popover p-1 shadow-lg"
			style={{ left: `${x}px`, top: `${y}px` }}
		>
			<button type="button" onClick={onEdit} disabled={!canEdit} className={menuItemClass}>
				<span className="icon-[solar--pen-2-linear] h-3.5 w-3.5" />
				{labels.edit}
			</button>
			<button type="button" onClick={onCopy} disabled={!canCopy} className={menuItemClass}>
				<span className="icon-[solar--copy-linear] h-3.5 w-3.5" />
				{labels.copy}
			</button>
			<div className="mx-1.5 my-1 h-px bg-border" />
			<button
				type="button"
				onClick={onDelete}
				disabled={!canDelete}
				className={destructiveMenuItemClass}
			>
				<span className="icon-[solar--trash-bin-trash-linear] h-3.5 w-3.5" />
				{labels.delete}
			</button>
		</motion.div>
	);
}
