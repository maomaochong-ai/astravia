import type { JSX } from "react";
import { TextPreview, type TextPreviewLabels } from "./TextPreview";

export interface WriteContentViewProps {
	content: string;
	label: string;
	labels: TextPreviewLabels;
}

export function WriteContentView({ content, label, labels }: WriteContentViewProps): JSX.Element {
	return <TextPreview label={label} text={content} labels={labels} />;
}
