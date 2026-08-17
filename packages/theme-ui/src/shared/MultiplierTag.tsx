import type { JSX } from "react";

/** Format a billing multiplier: integers as-is; decimals max 2 places, trailing zeros stripped. */
export function fmtMultiplier(n: number): string {
	return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
}

export interface MultiplierTagProps {
	/** Fully resolved display text from host (free label or formatted multiplier). */
	text: string;
}

export function MultiplierTag({ text }: MultiplierTagProps): JSX.Element {
	return <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{text}</span>;
}
