import { AnimatePresence, motion } from "motion/react";
import type { JSX } from "react";

const easeOut = [0.16, 1, 0.3, 1] as const;

export interface GuideBadgeViewItem {
	id: string;
	icon: string;
	text: string;
	dismissible: boolean;
	onClick: () => void;
}

export interface GuideBadgeSwiperViewLabels {
	dismissTooltip: string;
}

export interface GuideBadgeSwiperViewProps {
	mounted: boolean;
	current: GuideBadgeViewItem;
	labels: GuideBadgeSwiperViewLabels;
	onDismiss: (badgeId: string) => void;
}

/**
 * Rotating feature-hint badges under the composer / new-session hero.
 * Host pre-resolves navigation handlers and i18n labels.
 */
export function GuideBadgeSwiperView({
	mounted,
	current,
	labels,
	onDismiss,
}: GuideBadgeSwiperViewProps): JSX.Element {
	return (
		<motion.div
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: mounted ? 1 : 0, y: mounted ? 0 : 8 }}
			transition={{ duration: 0.5, ease: easeOut }}
			className="mb-3 flex h-8 w-full items-center"
		>
			<AnimatePresence mode="wait">
				<motion.div
					key={current.id}
					initial={{ opacity: 0, y: 6 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: -6 }}
					transition={{ duration: 0.32, ease: easeOut }}
					className="flex items-center"
				>
					<button
						type="button"
						onClick={current.onClick}
						title={current.text}
						className="group flex h-7 items-center gap-1.5 rounded-full border border-primary/30 bg-[color-mix(in_srgb,var(--primary)_8%,var(--card))] pl-2.5 pr-2 text-[11px] font-medium text-primary transition-colors hover:border-primary/50 hover:bg-[color-mix(in_srgb,var(--primary)_14%,var(--card))]"
					>
						<span className={`${current.icon} h-3 w-3 shrink-0`} />
						<span className="whitespace-nowrap">{current.text}</span>
						{current.dismissible && (
							<span
								role="button"
								tabIndex={-1}
								aria-label={labels.dismissTooltip}
								title={labels.dismissTooltip}
								onClick={(e) => {
									e.stopPropagation();
									onDismiss(current.id);
								}}
								className="ml-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-primary/60 transition-colors hover:bg-primary/15 hover:text-primary"
							>
								<span className="icon-[mdi--close] h-3 w-3" />
							</span>
						)}
					</button>
				</motion.div>
			</AnimatePresence>
		</motion.div>
	);
}
