import type { ComponentType, JSX } from "react";

export interface PluginFilePreviewViewProps<TFile = unknown> {
	file: TFile;
	component: ComponentType<{ file: TFile }>;
}

/**
 * Thin host shell for a plugin-contributed file preview component.
 *
 * Layout fence: `transform` makes this node the containing block for
 * `position: fixed` descendants; `overflow-hidden` + `isolate` keep paint and
 * stacking inside the preview pane (plugins must not target the viewport).
 */
export function PluginFilePreviewView<TFile = unknown>({
	file,
	component: Component,
}: PluginFilePreviewViewProps<TFile>): JSX.Element {
	return (
		<div className="relative isolate flex min-h-0 flex-1 flex-col overflow-hidden [transform:translateZ(0)]">
			<Component file={file} />
		</div>
	);
}
