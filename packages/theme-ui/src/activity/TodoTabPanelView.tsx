import type { JSX } from "react";
import { TodoCard, type TodoCardItem } from "../chat/TodoCard";

export interface TodoTabPanelViewProps {
	items: readonly TodoCardItem[];
	emptyLabel: string;
	todoLabels: {
		allDone: string;
		pending: string;
		viewMore: string;
		collapse: string;
		expandRemaining: (hiddenCount: number) => string;
	};
}

export function TodoTabPanelView({ items, emptyLabel, todoLabels }: TodoTabPanelViewProps): JSX.Element {
	if (items.length === 0) {
		return (
			<div className="flex flex-1 items-center justify-center p-4 text-sm text-muted-foreground">
				{emptyLabel}
			</div>
		);
	}

	return <TodoCard items={items} labels={todoLabels} />;
}
