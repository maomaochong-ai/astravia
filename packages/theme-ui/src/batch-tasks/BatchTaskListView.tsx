import type { JSX, ReactNode } from "react";

export interface BatchTaskListViewProps {
	/** Pre-built project block nodes from host (or theme composition). */
	children: ReactNode;
}

export function BatchTaskListView({ children }: BatchTaskListViewProps): JSX.Element {
	return <div className="flex flex-col gap-6">{children}</div>;
}
