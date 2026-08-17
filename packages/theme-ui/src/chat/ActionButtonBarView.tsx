import { AnimatePresence, motion } from "motion/react";
import type { JSX } from "react";

export interface ActionButtonBarItem {
	id: string;
	label: string;
	icon?: string;
}

export interface ActionButtonBarViewProps {
	buttons: readonly ActionButtonBarItem[];
	onClick: (id: string) => void;
}

export function ActionButtonBarView({ buttons, onClick }: ActionButtonBarViewProps): JSX.Element {
	return (
		<div className="mb-1.5 flex flex-wrap gap-1.5 px-1">
			<AnimatePresence initial={false}>
				{buttons.map((btn, idx) => (
					<motion.button
						key={btn.id}
						type="button"
						initial={{ scale: 0.7, opacity: 0, y: 6 }}
						animate={{ scale: 1, opacity: 1, y: 0 }}
						exit={{ scale: 0.7, opacity: 0, y: -4 }}
						transition={{
							type: "spring",
							stiffness: 480,
							damping: 30,
							delay: idx * 0.03,
						}}
						whileHover={{ y: -1, scale: 1.02 }}
						whileTap={{ scale: 0.96 }}
						onClick={() => onClick(btn.id)}
						className="flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/8 px-3 py-1 text-[12px] font-medium text-primary transition-colors hover:bg-primary/15"
						style={{ background: "color-mix(in srgb, var(--primary) 8%, transparent)" }}
					>
						{btn.icon && <span className={`${btn.icon} h-3.5 w-3.5`} />}
						<span>{btn.label}</span>
					</motion.button>
				))}
			</AnimatePresence>
		</div>
	);
}
