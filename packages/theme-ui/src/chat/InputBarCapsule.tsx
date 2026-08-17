import { memo, type JSX } from "react";
import { motion } from "motion/react";

const SPRING = { type: "spring" as const, stiffness: 460, damping: 32, mass: 0.9 };
const CAPSULE_INITIAL = { scale: 0.85, opacity: 0, y: 4 };
const CAPSULE_ANIMATE = { scale: 1, opacity: 1, y: 0 };
const CAPSULE_EXIT = { scale: 0.85, opacity: 0, y: -2 };
const CAPSULE_HOVER = { y: -1 };
const CAPSULE_TAP = { scale: 0.96 };

export interface InputBarCapsuleLabels {
	removeDefault: string;
	removeTooltip: (path: string) => string;
}

export interface InputBarCapsuleProps {
	icon: string;
	label: string;
	labels: InputBarCapsuleLabels;
	title?: string;
	tone: "primary" | "muted";
	onRemove: () => void;
}

export const InputBarCapsule = memo(function InputBarCapsule({
	icon,
	label,
	labels,
	title,
	tone,
	onRemove,
}: InputBarCapsuleProps): JSX.Element {
	const toneClass =
		tone === "primary"
			? "bg-primary/10 text-primary border-primary/20"
			: "bg-muted text-muted-foreground border-border/60";
	return (
		<motion.button
			type="button"
			layout
			initial={CAPSULE_INITIAL}
			animate={CAPSULE_ANIMATE}
			exit={CAPSULE_EXIT}
			transition={SPRING}
			whileHover={CAPSULE_HOVER}
			whileTap={CAPSULE_TAP}
			onClick={onRemove}
			title={title ? labels.removeTooltip(title) : labels.removeDefault}
			className={`group flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${toneClass}`}
		>
			<span className={`${icon} h-3 w-3 shrink-0`} />
			<span className="max-w-[140px] truncate">{label}</span>
			<span className="icon-[solar--close-circle-linear] h-3 w-3 opacity-50 transition-opacity group-hover:opacity-100" />
		</motion.button>
	);
});
