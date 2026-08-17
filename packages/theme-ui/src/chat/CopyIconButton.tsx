import { useCallback, useEffect, useRef, useState, type JSX } from "react";

export interface CopyIconButtonLabels {
	label: string;
	copied: string;
}

export interface CopyIconButtonProps {
	getText: () => string;
	/** Optional override for the idle label; defaults to labels.label. */
	label?: string;
	labels: CopyIconButtonLabels;
}

export function CopyIconButton({ getText, label, labels }: CopyIconButtonProps): JSX.Element {
	const resolvedLabel = label ?? labels.label;
	const [copied, setCopied] = useState(false);
	const timerRef = useRef<number | null>(null);

	useEffect(() => {
		return () => {
			if (timerRef.current !== null) window.clearTimeout(timerRef.current);
		};
	}, []);

	const onClick = useCallback(
		(event: { stopPropagation: () => void }) => {
			event.stopPropagation();
			const text = getText();
			if (!text) return;
			void navigator.clipboard.writeText(text).then(
				() => {
					setCopied(true);
					if (timerRef.current !== null) window.clearTimeout(timerRef.current);
					timerRef.current = window.setTimeout(() => {
						setCopied(false);
						timerRef.current = null;
					}, 1500);
				},
				(err) => {
					console.warn("[CopyIconButton] copy failed", err);
				},
			);
		},
		[getText],
	);

	const aria = copied ? labels.copied : resolvedLabel;

	return (
		<button
			type="button"
			onClick={onClick}
			title={aria}
			aria-label={aria}
			className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground/55 transition-colors hover:bg-muted/60 hover:text-foreground"
		>
			<span className={`h-3.5 w-3.5 ${copied ? "icon-[mdi--check]" : "icon-[mdi--content-copy]"}`} />
		</button>
	);
}
