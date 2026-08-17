import type { JSX } from "react";

export interface BatchProjectArtifactFieldViewLabels {
	readonly title: string;
	readonly optional: string;
	readonly placeholder: string;
	readonly hint: string;
}

export interface BatchProjectArtifactFieldViewProps {
	readonly value: string;
	readonly onChange: (value: string) => void;
	readonly labels: BatchProjectArtifactFieldViewLabels;
}

export function BatchProjectArtifactFieldView({
	value,
	onChange,
	labels,
}: BatchProjectArtifactFieldViewProps): JSX.Element {
	return (
		<div>
			<label className="mb-2 flex items-center justify-between text-sm font-medium text-foreground">
				<span>{labels.title}</span>
				<span className="text-xs font-normal text-muted-foreground/60">{labels.optional}</span>
			</label>
			<textarea
				value={value}
				onChange={(event) => onChange(event.target.value)}
				className="min-h-[72px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
				placeholder={labels.placeholder}
			/>
			<p className="mt-2 text-xs text-muted-foreground/60">{labels.hint}</p>
		</div>
	);
}
