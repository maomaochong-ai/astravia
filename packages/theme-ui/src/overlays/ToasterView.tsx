import { AnimatePresence, motion } from "motion/react";
import type { JSX } from "react";

export type ToasterVariant = "info" | "success" | "warning" | "error";

export interface ToasterItemView {
	readonly actionLabel?: string;
	readonly id: string;
	readonly message: string;
	readonly title?: string;
	readonly variant: ToasterVariant;
}

export interface ToasterViewProps {
	readonly closeTitle: string;
	readonly onAction: (id: string) => void;
	readonly onDismiss: (id: string) => void;
	readonly toasts: readonly ToasterItemView[];
}

const VARIANT_STYLES: Record<ToasterVariant, { ring: string; icon: string; iconColor: string }> = {
	info: { ring: "ring-border", icon: "icon-[mdi--information-outline]", iconColor: "text-foreground/70" },
	success: { ring: "ring-emerald-500/30", icon: "icon-[mdi--check-circle-outline]", iconColor: "text-emerald-500" },
	warning: { ring: "ring-amber-500/30", icon: "icon-[mdi--alert-outline]", iconColor: "text-amber-500" },
	error: { ring: "ring-destructive/40", icon: "icon-[mdi--alert-circle-outline]", iconColor: "text-destructive" },
};

export function ToasterView({ closeTitle, onAction, onDismiss, toasts }: ToasterViewProps): JSX.Element {
	return (
		<div className="pointer-events-none fixed bottom-4 right-4 z-[200] flex w-[340px] flex-col gap-2">
			<AnimatePresence initial={false}>
				{toasts.map((toast) => {
					const style = VARIANT_STYLES[toast.variant];
					return (
						<motion.div
							key={toast.id}
							layout
							initial={{ opacity: 0, y: 16, scale: 0.96 }}
							animate={{ opacity: 1, y: 0, scale: 1 }}
							exit={{ opacity: 0, x: 24, scale: 0.96 }}
							transition={{ duration: 0.18, ease: [0.22, 0.61, 0.36, 1] }}
							className={`pointer-events-auto flex items-start gap-2.5 rounded-xl border border-border bg-popover px-3.5 py-3 shadow-xl ring-1 ring-inset ${style.ring}`}
						>
							<span className={`${style.icon} mt-0.5 h-4 w-4 shrink-0 ${style.iconColor}`} />
							<div className="min-w-0 flex-1">
								{toast.title && (
									<div className="text-[13px] font-medium text-foreground">{toast.title}</div>
								)}
								<div className="break-words text-[12px] leading-[1.5] text-muted-foreground">
									{toast.message}
								</div>
								{toast.actionLabel && (
									<button
										type="button"
										onClick={() => onAction(toast.id)}
										className="mt-1.5 text-[12px] font-medium text-primary transition-colors hover:text-primary/80"
									>
										{toast.actionLabel}
									</button>
								)}
							</div>
							<button
								type="button"
								onClick={() => onDismiss(toast.id)}
								className="shrink-0 text-muted-foreground/60 transition-colors hover:text-foreground"
								title={closeTitle}
							>
								<span className="icon-[mdi--close] h-3.5 w-3.5" />
							</button>
						</motion.div>
					);
				})}
			</AnimatePresence>
		</div>
	);
}
