import type { JSX } from "react";
import { PANEL_BAND_Y, PANEL_CONTENT_MIN_HEIGHT } from "./cultivationPanelChrome";

/**
 * Three bands aligned to the panel art lines:
 * top band (above first line) → header
 * middle band (between lines) → main
 * bottom band (below second line) → footer
 */
export function CultivationPanelContentLayout({
	footer,
	header,
	main,
}: {
	readonly footer: JSX.Element;
	readonly header: JSX.Element;
	readonly main: JSX.Element;
}): JSX.Element {
	return (
		<div
			className="grid w-full"
			style={{
				// Top/bottom bands match art chrome; middle keeps a floor so icons aren't cramped.
				gridTemplateRows: `${PANEL_BAND_Y} minmax(12.5rem, auto) ${PANEL_BAND_Y}`,
				minHeight: PANEL_CONTENT_MIN_HEIGHT,
			}}
		>
			<div className="flex items-center">{header}</div>
			<div className="flex min-h-0 flex-col justify-center py-3">{main}</div>
			<div className="flex items-center">{footer}</div>
		</div>
	);
}
