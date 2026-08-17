import type { JSX, ReactNode } from "react";

export interface BatchProgressTabPanelViewProps {
	/** When null/undefined, show empty state. */
	children?: ReactNode;
	emptyLabel: string;
}

export function BatchProgressTabPanelView({
	children,
	emptyLabel,
}: BatchProgressTabPanelViewProps): JSX.Element {
	if (!children) {
		return (
			<div className="flex h-full items-center justify-center text-[12px] text-muted-foreground/50">
				{emptyLabel}
			</div>
		);
	}

	return <div className="h-full overflow-y-auto px-3 py-3">{children}</div>;
}
