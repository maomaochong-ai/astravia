import type { JSX, MouseEvent, PointerEvent, ReactNode } from "react";

export interface CodeBlockCopyButtonLabels {
	copy: string;
	copied: string;
}

export interface CodeBlockCopyButtonViewProps {
	children: ReactNode;
	copied: boolean;
	onCopy: () => void;
	labels: CodeBlockCopyButtonLabels;
}

/** Props-driven copy chrome around a code block. Host owns clipboard state. */
export function CodeBlockCopyButtonView({
	children,
	copied,
	onCopy,
	labels,
}: CodeBlockCopyButtonViewProps): JSX.Element {
	function stopMessageDrag(event: MouseEvent<HTMLButtonElement> | PointerEvent<HTMLButtonElement>): void {
		event.preventDefault();
		event.stopPropagation();
	}

	function handleCopy(event: MouseEvent<HTMLButtonElement>): void {
		stopMessageDrag(event);
		onCopy();
	}

	return (
		<div className="group/code-block relative">
			<button
				type="button"
				onPointerDown={stopMessageDrag}
				onMouseDown={stopMessageDrag}
				onClick={handleCopy}
				aria-label={copied ? labels.copied : labels.copy}
				title={copied ? labels.copied : labels.copy}
				className="absolute right-2 top-2 z-20 inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-[#30363d] bg-[#161b22]/95 text-[#c9d1d9] opacity-0 shadow-sm transition-opacity hover:bg-[#21262d] hover:text-white focus-visible:opacity-100 group-hover/code-block:opacity-100"
			>
				<span className={copied ? "icon-[mdi--check] h-4 w-4" : "icon-[solar--copy-linear] h-4 w-4"} />
			</button>
			{children}
		</div>
	);
}
