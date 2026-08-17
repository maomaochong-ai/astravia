import { useEffect, useRef, useState, type JSX } from "react";

export interface SessionRenameInputViewProps {
	/** Extra className for layout variants (inline pl padding vs default). */
	className?: string;
	initialValue: string;
	onCancel: () => void;
	onCommit: (value: string) => void;
}

/**
 * Inline session rename field. Host supplies initial label and commit side-effects.
 */
export function SessionRenameInputView({
	className = "min-w-0 flex-1 truncate rounded-[3px] border border-input bg-accent/50 text-[13px] text-foreground outline-none",
	initialValue,
	onCancel,
	onCommit,
}: SessionRenameInputViewProps): JSX.Element {
	const [value, setValue] = useState(initialValue);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		inputRef.current?.focus();
		inputRef.current?.select();
	}, []);

	function commit(): void {
		const trimmed = value.trim();
		if (trimmed && trimmed !== initialValue) {
			onCommit(trimmed);
		}
		onCancel();
	}

	return (
		<input
			ref={inputRef}
			value={value}
			onChange={(event) => setValue(event.target.value)}
			onBlur={commit}
			onKeyDown={(event) => {
				if (event.key === "Enter") commit();
				if (event.key === "Escape") onCancel();
			}}
			className={className}
		/>
	);
}
