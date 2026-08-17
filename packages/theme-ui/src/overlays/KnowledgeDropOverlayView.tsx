import { AnimatePresence, motion } from "motion/react";
import type { JSX } from "react";
import { ThemeSurface } from "../appearance/ThemeSurface";

export interface KnowledgeDropOverlayViewProps {
	readonly description: string;
	readonly enabled: boolean;
	readonly title: string;
	readonly visible: boolean;
}

export function KnowledgeDropOverlayView({
	description,
	enabled,
	title,
	visible,
}: KnowledgeDropOverlayViewProps): JSX.Element {
	return (
		<AnimatePresence>
			{visible && enabled && (
				<motion.div
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					className="pointer-events-none fixed inset-2 z-[80] flex items-center justify-center rounded-2xl border border-dashed border-primary/60 bg-background/80 backdrop-blur-md"
				>
					<ThemeSurface slot="root.knowledgeDropOverlay" />
					<motion.div
						initial={{ y: 8, scale: 0.98 }}
						animate={{ y: 0, scale: 1 }}
						className="relative z-10 flex max-w-sm flex-col items-center text-center"
					>
						<div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/20">
							<span className="icon-[mdi--folder-arrow-down-outline] h-8 w-8" />
						</div>
						<h2 className="text-[18px] font-semibold text-foreground">{title}</h2>
						<p className="mt-2 text-[12px] leading-5 text-muted-foreground">{description}</p>
					</motion.div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
