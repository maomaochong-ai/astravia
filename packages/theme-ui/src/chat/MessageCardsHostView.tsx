import type { JSX, ReactNode } from "react";

export interface MessageCardsHostViewProps {
	/** Host MessageCards (plugin card tabs). */
	children: ReactNode;
}

/**
 * Thin host slot for plugin message cards. Resolution happens in the desktop model.
 */
export function MessageCardsHostView({ children }: MessageCardsHostViewProps): JSX.Element {
	return <>{children}</>;
}
