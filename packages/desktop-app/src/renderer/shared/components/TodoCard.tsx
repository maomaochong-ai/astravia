import {
	TodoCard as ThemeTodoCard,
	type TodoCardProps as ThemeTodoCardProps,
} from "@astravia/theme-ui/chat";
import type { TodoItem } from "@shared/store/todo-atoms";

type HostTodoCardProps = {
	items: readonly TodoItem[];
	compact?: boolean;
	onViewMore?: () => void;
};

/**
 * Desktop adapter: maps TodoItem and injects legacy UI labels (pre-existing hard-coded copy).
 * Pure view lives in @astravia/theme-ui/chat.
 */
export function TodoCard({ items, compact, onViewMore }: HostTodoCardProps): JSX.Element | null {
	const props: ThemeTodoCardProps = {
		items,
		compact,
		onViewMore,
		labels: {
			allDone: "全部完成",
			pending: "待办",
			viewMore: "查看更多",
			collapse: "收起",
			expandRemaining: (hiddenCount) => `展开全部（还有 ${hiddenCount} 项）`,
		},
	};
	return <ThemeTodoCard {...props} />;
}
