import { type JSX, useState } from "react";

export interface ReadImageViewProps {
	src: string;
	alt: string;
	/** e.g. "Processed" / "Image" */
	sizeLinePrefix: string;
	/** Formatted byte size for processed image. */
	processedSizeLabel: string;
	/** Host-provided "W x H"; null → use natural size after load. */
	hostProcessedDims: string | null;
	/** Shown before natural size is known when host dims are absent. */
	unknownDimsLabel: string;
	/** Full original meta line, or null. */
	originalLine: string | null;
	originalPath: string | null;
	showInFolderLabel: string;
	onOpenOriginal?: () => void;
}

/**
 * Tool-call image preview with processed/original meta and optional reveal-in-folder.
 */
export function ReadImageView({
	src,
	alt,
	sizeLinePrefix,
	processedSizeLabel,
	hostProcessedDims,
	unknownDimsLabel,
	originalLine,
	originalPath,
	showInFolderLabel,
	onOpenOriginal,
}: ReadImageViewProps): JSX.Element {
	const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
	const dims =
		hostProcessedDims ??
		(naturalSize ? `${naturalSize.width} x ${naturalSize.height}` : unknownDimsLabel);

	return (
		<div className="space-y-2">
			<div className="overflow-hidden rounded-md border border-muted-foreground/10 bg-muted/20">
				<img
					src={src}
					alt={alt}
					className="max-h-[420px] max-w-full object-contain"
					onLoad={(event) => {
						const img = event.currentTarget;
						setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
					}}
				/>
			</div>
			<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground/55">
				<span>
					{sizeLinePrefix} {dims} · {processedSizeLabel}
				</span>
				{originalLine && <span>{originalLine}</span>}
				{originalPath && onOpenOriginal && (
					<button
						type="button"
						onClick={onOpenOriginal}
						className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-[10px] text-primary/75 hover:bg-primary/10"
						title={originalPath}
					>
						<span className="icon-[mdi--folder-eye-outline] h-3 w-3" />
						<span>{showInFolderLabel}</span>
					</button>
				)}
			</div>
		</div>
	);
}
