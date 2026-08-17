import { activeSessionAtom, getTodoItemsForSession, todoItemsBySessionAtom } from "@shared/store/atoms";
import type { TodoItem } from "@shared/store/todo-atoms";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

export interface TodoTabPanelModel {
	items: TodoItem[];
	emptyLabel: string;
}

export function useTodoTabPanelModel(): TodoTabPanelModel {
	const { t } = useTranslation("chat");
	const todoMap = useAtomValue(todoItemsBySessionAtom);
	const activeSession = useAtomValue(activeSessionAtom);
	const items = useMemo(
		() => getTodoItemsForSession(todoMap, activeSession?.runtimeId ?? null),
		[todoMap, activeSession?.runtimeId],
	);

	return {
		items,
		emptyLabel: t("activityPanel.todo.empty"),
	};
}
