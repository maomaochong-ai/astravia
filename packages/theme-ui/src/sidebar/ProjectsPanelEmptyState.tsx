import type { JSX } from "react";

export interface ProjectsPanelEmptyStateLabels {
	title: string;
	description: string;
}

export interface ProjectsPanelEmptyStateProps {
	labels: ProjectsPanelEmptyStateLabels;
}

export function ProjectsPanelEmptyState({ labels }: ProjectsPanelEmptyStateProps): JSX.Element {
	return (
		<div className="flex flex-col items-center gap-2.5 px-4 py-10 text-center">
			<span className="icon-[solar--folder-open-linear] h-7 w-7 text-muted-foreground" />
			<p className="text-[11px] text-foreground">{labels.title}</p>
			<p className="text-[11px] text-muted-foreground">{labels.description}</p>
		</div>
	);
}
