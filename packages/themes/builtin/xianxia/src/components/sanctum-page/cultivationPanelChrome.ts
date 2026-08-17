/**
 * Composition popover art is 1506×624 with content dividers near y≈127 and y≈498.
 * Keep top/bottom slice past those rows so lines stay in fixed border regions
 * (not the vertically stretched center). borderWidth maps that top/bottom slice
 * into the header/footer bands that content layout targets.
 */
export const cultivationCompositionPanelDecoration = {
	borderWidth: "4.75rem 2.25rem",
	repeat: "stretch",
	slice: "140 80",
} as const;

export const cultivationPowerPanelDecoration = {
	borderWidth: "2.5rem",
	repeat: "stretch",
	slice: 110,
} as const;

/** Matches top/bottom `borderWidth` — header/footer sit in these bands. */
export const PANEL_BAND_Y = "4.75rem";

/** Ensures middle band (between the two art lines) has enough vertical room. */
export const PANEL_CONTENT_MIN_HEIGHT = "22.5rem";

/** Fixed popover width — wide enough for 5 equal metric columns + operator gutters. */
export const PANEL_WIDTH_CLASS = "w-[600px]";

export const contentSlideTransition = {
	duration: 0.34,
	ease: [0.32, 0.72, 0, 1] as const,
};

/** One fixed panel shell; only inner content slides. */
export const contentSlideVariants = {
	enter: (slide: 1 | -1) => ({
		x: slide > 0 ? "56%" : "-56%",
		opacity: 0,
	}),
	center: {
		x: 0,
		opacity: 1,
		position: "relative" as const,
	},
	exit: (slide: 1 | -1) => ({
		x: slide > 0 ? "-56%" : "56%",
		opacity: 0,
		position: "absolute" as const,
		top: 0,
		left: 0,
		right: 0,
	}),
};
