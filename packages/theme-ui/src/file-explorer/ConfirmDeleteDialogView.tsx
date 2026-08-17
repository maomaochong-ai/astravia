import { motion } from "motion/react";
import { useEffect, type JSX, type ReactNode } from "react";

export interface ConfirmDeleteDialogViewLabels {
	title: string;
	/** Full description body (host pre-resolves type / name / suffix). */
	description: ReactNode;
}

export interface ConfirmDeleteDialogViewProps {
	labels: ConfirmDeleteDialogViewLabels;
	onCancel: () => void;
	/** Host Button (cancel). */
	cancelButton: ReactNode;
	/** Host Button (confirm delete). */
	confirmButton: ReactNode;
}

/**
 * Confirm delete overlay. Host injects Button slots and i18n description.
 */
export function ConfirmDeleteDialogView({
	labels,
	onCancel,
	cancelButton,
	confirmButton,
}: ConfirmDeleteDialogViewProps): JSX.Element {
	useEffect(() => {
		function handleKey(e: KeyboardEvent) {
			if (e.key === "Escape") onCancel();
		}
		document.addEventListener("keydown", handleKey);
		return () => document.removeEventListener("keydown", handleKey);
	}, [onCancel]);

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
			onClick={onCancel}
			onKeyDown={(e) => {
				if (e.key === "Escape") onCancel();
			}}
			role="dialog"
			aria-modal="true"
		>
			<motion.div
				initial={{ opacity: 0, scale: 0.95 }}
				animate={{ opacity: 1, scale: 1 }}
				transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
				className="w-[280px] rounded-xl border border-border bg-popover p-4 shadow-xl"
				onClick={(e) => e.stopPropagation()}
			>
				<p className="mb-1 text-[13px] font-semibold text-foreground">{labels.title}</p>
				<p className="mb-4 text-[12px] text-muted-foreground">{labels.description}</p>
				<div className="flex justify-end gap-2">
					{cancelButton}
					{confirmButton}
				</div>
			</motion.div>
		</div>
	);
}
