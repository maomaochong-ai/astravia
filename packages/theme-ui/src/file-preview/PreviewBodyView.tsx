import type { JSX, ReactNode } from "react";
import type { FilePreviewItem } from "./types";
import { getExtension } from "./types";

export interface PreviewBodyViewLabels {
	unsupported: string;
	download: string;
}

export type PreviewBodyViewState =
	| { status: "plugin"; content: ReactNode }
	| { status: "unsupported"; item: FilePreviewItem }
	| { status: "loading" }
	| { status: "error"; message: string }
	| { status: "content"; content: ReactNode };

export interface PreviewBodyViewProps {
	state: PreviewBodyViewState;
	labels: PreviewBodyViewLabels;
	onDownload?: (item: FilePreviewItem) => void;
}

/**
 * File preview body states: plugin slot / loading / error / unsupported / content.
 */
export function PreviewBodyView({ state, labels, onDownload }: PreviewBodyViewProps): JSX.Element {
	if (state.status === "plugin") {
		return <>{state.content}</>;
	}

	if (state.status === "unsupported") {
		return (
			<UnsupportedDetail
				item={state.item}
				labels={labels}
				onDownload={onDownload}
			/>
		);
	}

	if (state.status === "loading") {
		return (
			<div className="flex min-h-0 flex-1 items-center justify-center p-8">
				<span className="icon-[mdi--loading] animate-spin text-[24px] text-muted-foreground/50" />
			</div>
		);
	}

	if (state.status === "error") {
		return (
			<div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-8 text-muted-foreground/50">
				<span className="icon-[mdi--alert-circle-outline] text-[40px]" />
				<span className="text-[13px]">{state.message}</span>
			</div>
		);
	}

	return <>{state.content}</>;
}

function UnsupportedDetail({
	item,
	labels,
	onDownload,
}: {
	item: FilePreviewItem;
	labels: PreviewBodyViewLabels;
	onDownload?: (item: FilePreviewItem) => void;
}): JSX.Element {
	const ext = getExtension(item.name);
	const downloadable = !!item.url;

	return (
		<div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-6 py-12">
			<div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-muted">
				<span className="icon-[mdi--file-outline] h-10 w-10 text-muted-foreground/60" />
			</div>
			<div className="text-center">
				<p className="max-w-md break-all text-[14px] font-semibold text-foreground">{item.name}</p>
				{ext && (
					<p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
						{ext}
					</p>
				)}
				<p className="mt-2 text-[11px] text-muted-foreground/60">{labels.unsupported}</p>
			</div>
			{downloadable && onDownload && (
				<button
					type="button"
					onClick={() => onDownload(item)}
					className="flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-[12.5px] font-medium text-primary-foreground shadow-md transition-all duration-200 hover:scale-105 hover:bg-primary/90"
				>
					<span className="icon-[mdi--download] h-4 w-4" />
					{labels.download}
				</button>
			)}
		</div>
	);
}
