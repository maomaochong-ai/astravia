import type { JSX } from "react";

export interface TextPreviewLabels {
	characterUnit: string;
	emptyLabel: string;
	lineUnit: string;
}

export interface TextPreviewProps {
	label: string;
	text: string;
	emptyLabel?: string;
	labels: TextPreviewLabels;
}

function lineCount(text: string): number {
	if (text.length === 0) return 0;
	return text.split("\n").length;
}

export function TextPreview({ label, text, emptyLabel, labels }: TextPreviewProps): JSX.Element {
	const lines = lineCount(text);
	const resolvedEmptyLabel = emptyLabel ?? labels.emptyLabel;
	return (
		<div className="space-y-1.5">
			<div className="flex items-center gap-2 text-[10px] text-muted-foreground/50">
				<span className="font-medium text-muted-foreground/60">{label}</span>
				<span>
					{lines} {labels.lineUnit} · {text.length} {labels.characterUnit}
				</span>
			</div>
			<pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/25 p-2 text-[11px] leading-[1.5] text-foreground/70">
				{text.length > 0 ? text : resolvedEmptyLabel}
			</pre>
		</div>
	);
}
