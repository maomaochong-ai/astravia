import type { QueueCardItem, QueueCardViewLabels } from "@astravia/theme-ui/chat";
import {
	getQueueForSession,
	messageQueueBySessionAtom,
	removeQueuedMessageAtom,
	setQueueForSessionAtom,
} from "@shared/store/message-queue-atoms";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";

export interface QueueCardModel {
	items: QueueCardItem[];
	labels: QueueCardViewLabels;
	onReorder: (orderedIds: readonly string[]) => void;
	onRemove: (id: string) => void;
}

export function useQueueCardModel(runtimeId: string): QueueCardModel {
	const { t } = useTranslation("chat");
	const queueMap = useAtomValue(messageQueueBySessionAtom);
	const setQueue = useSetAtom(setQueueForSessionAtom);
	const removeQueued = useSetAtom(removeQueuedMessageAtom);
	const fullItems = getQueueForSession(queueMap, runtimeId);

	const items = useMemo<QueueCardItem[]>(
		() => fullItems.map((item) => ({ id: item.id, displayText: item.displayText })),
		[fullItems],
	);

	const onReorder = useCallback(
		(orderedIds: readonly string[]) => {
			const byId = new Map(fullItems.map((item) => [item.id, item]));
			const next = orderedIds.map((id) => byId.get(id)).filter((item) => item !== undefined);
			setQueue({ runtimeId, items: next });
		},
		[fullItems, runtimeId, setQueue],
	);

	const onRemove = useCallback(
		(id: string) => {
			removeQueued({ runtimeId, id });
		},
		[removeQueued, runtimeId],
	);

	const labels = useMemo<QueueCardViewLabels>(
		() => ({
			empty: t("inputBar.drawer.queueEmpty"),
			sendNow: t("inputBar.drawer.queueSendNow"),
			delete: t("inputBar.drawer.queueDelete"),
		}),
		[t],
	);

	return { items, labels, onReorder, onRemove };
}
