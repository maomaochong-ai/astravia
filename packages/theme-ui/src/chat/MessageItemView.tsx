import type { JSX, ReactNode } from "react";

export interface CompactionBoundaryViewProps {
	label: string;
}

export function CompactionBoundaryView({ label }: CompactionBoundaryViewProps): JSX.Element {
	return (
		<div className="flex items-center gap-3 py-1">
			<div className="h-px flex-1 bg-muted-foreground/15" />
			<span className="flex items-center gap-1.5 text-[11px] text-muted-foreground/40">
				<span className="icon-[mdi--compress] h-3 w-3" />
				{label}
			</span>
			<div className="h-px flex-1 bg-muted-foreground/15" />
		</div>
	);
}

export interface ModelSwitchBoundaryViewProps {
	prefix: string;
	label: string;
}

export function ModelSwitchBoundaryView({ prefix, label }: ModelSwitchBoundaryViewProps): JSX.Element {
	return (
		<div className="flex items-center gap-3 py-1">
			<div className="h-px flex-1 bg-muted-foreground/8" />
			<span className="flex items-center gap-1.5 text-[11px] text-primary/70">
				<span className="icon-[mdi--swap-horizontal] h-3 w-3" />
				{prefix}
				{label}
			</span>
			<div className="h-px flex-1 bg-muted-foreground/8" />
		</div>
	);
}

export interface ForkOriginBannerViewProps {
	/** Full accessible label / title. */
	label: string;
	/** Optional short preview of the source message. */
	preview?: string;
	/** When set, banner is clickable. */
	onClick?: () => void;
	/** Disabled state (e.g. parent session missing). */
	disabled?: boolean;
}

/** Inline hint under the forked turn’s AI reply: no chrome, centered text. */
export function ForkOriginBannerView({
	label,
	preview,
	onClick,
	disabled,
}: ForkOriginBannerViewProps): JSX.Element {
	const interactive = Boolean(onClick) && !disabled;
	const title = preview ? `${label} · ${preview}` : label;
	const text = preview ? (
		<>
			{label}
			<span className="text-muted-foreground/50"> · </span>
			{preview}
		</>
	) : (
		label
	);
	// mt-4: leave clear gap under the assistant bubble; py keeps hit area usable.
	const className =
		"mx-auto mt-4 flex max-w-full items-center justify-center gap-1 px-2 py-1.5 text-center text-[11px] text-muted-foreground/60";
	if (interactive) {
		return (
			<button
				type="button"
				onClick={onClick}
				className={`${className} cursor-pointer transition-colors hover:text-primary/70`}
				title={title}
			>
				<span className="icon-[mdi--source-fork] h-3 w-3 shrink-0" />
				<span className="min-w-0 truncate">{text}</span>
			</button>
		);
	}
	return (
		<div className={className} title={title}>
			<span className="icon-[mdi--source-fork] h-3 w-3 shrink-0" />
			<span className="min-w-0 truncate">{text}</span>
		</div>
	);
}

export interface MessageItemViewProps {
	children: ReactNode;
}

/** Thin slot wrapper for a single message row. */
export function MessageItemView({ children }: MessageItemViewProps): JSX.Element {
	return <>{children}</>;
}

export interface ExportMessageListViewProps {
	children: ReactNode;
	listRef?: React.Ref<HTMLDivElement>;
}

export function ExportMessageListView({ children, listRef }: ExportMessageListViewProps): JSX.Element {
	return (
		<div
			ref={listRef}
			className="chat-export-document mx-auto flex w-full max-w-3xl flex-col px-5 py-5"
		>
			{children}
		</div>
	);
}
