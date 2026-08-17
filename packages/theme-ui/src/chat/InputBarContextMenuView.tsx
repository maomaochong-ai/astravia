import { motion } from "motion/react";
import { useEffect, useRef, type JSX } from "react";

export interface InputBarContextMenuViewLabels {
	copy: string;
	cut: string;
	paste: string;
}

export interface InputBarContextMenuViewProps {
	canCopy: boolean;
	canCut: boolean;
	canPaste: boolean;
	labels: InputBarContextMenuViewLabels;
	onClose: () => void;
	onCopy: () => void;
	onCut: () => void;
	onPaste: () => void;
	x: number;
	y: number;
}

const menuItemClass =
	"flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[12px] font-medium text-foreground transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-40";

export function InputBarContextMenuView({
	canCopy,
	canCut,
	canPaste,
	labels,
	onClose,
	onCopy,
	onCut,
	onPaste,
	x,
	y,
}: InputBarContextMenuViewProps): JSX.Element {
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
			className="fixed z-[1000] w-[160px] overflow-hidden rounded-lg border border-border bg-popover p-1 shadow-lg"
			style={{ left: `${x}px`, top: `${y}px` }}
		>
			<button type="button" onClick={onCut} disabled={!canCut} className={menuItemClass}>
				<span className="icon-[solar--scissors-linear] h-3.5 w-3.5" />
				{labels.cut}
			</button>
			<button type="button" onClick={onCopy} disabled={!canCopy} className={menuItemClass}>
				<span className="icon-[solar--copy-linear] h-3.5 w-3.5" />
				{labels.copy}
			</button>
			<button type="button" onClick={onPaste} disabled={!canPaste} className={menuItemClass}>
				<span className="icon-[solar--clipboard-linear] h-3.5 w-3.5" />
				{labels.paste}
			</button>
		</motion.div>
	);
}
