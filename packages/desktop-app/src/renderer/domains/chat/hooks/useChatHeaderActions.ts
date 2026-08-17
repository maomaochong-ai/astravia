import {
	activityPanelOpenAtom,
	closeInlineFilePreviewAtom,
	inlineFilePreviewContextReadonlyAtom,
} from "@shared/store/atoms";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

/** 顶部栏「窗口置顶」按钮的状态与动作。 */
export interface ChatHeaderPinState {
	pinned: boolean;
	pinTitle: string;
	onTogglePin: () => Promise<void>;
}

/** 顶部栏「活动面板」按钮的状态与动作。 */
export interface ChatHeaderPanelState {
	panelOpen: boolean;
	panelTitle: string;
	onTogglePanel: () => void;
}

export interface ChatHeaderActionsState {
	pin: ChatHeaderPinState;
	panel: ChatHeaderPanelState;
}

/**
 * 顶部栏「窗口置顶 + 活动面板」按钮的共享状态。
 * 正在对话页与新建会话页共用：窗口置顶是全局的，活动面板读同一 atom，
 * 因此两页按钮行为天然一致。
 */
export function useChatHeaderActions(): ChatHeaderActionsState {
	const { t } = useTranslation("chat");
	const [pinned, setPinned] = useState(false);
	const [panelOpen, setPanelOpen] = useAtom(activityPanelOpenAtom);
	const inlinePreviewActive = useAtomValue(inlineFilePreviewContextReadonlyAtom) !== null;
	const closeInlinePreview = useSetAtom(closeInlineFilePreviewAtom);

	useEffect(() => {
		void window.astravia.window.isAlwaysOnTop().then(setPinned);
	}, []);

	const onTogglePin = useCallback(async () => {
		const next = await window.astravia.window.toggleAlwaysOnTop();
		setPinned(next);
	}, []);

	const onTogglePanel = useCallback(() => {
		// 文件预览打开时，点按钮先关预览再收起面板，与对话页行为一致。
		if (inlinePreviewActive) {
			closeInlinePreview();
			setPanelOpen(false);
			return;
		}
		setPanelOpen((open) => !open);
	}, [closeInlinePreview, inlinePreviewActive, setPanelOpen]);

	return {
		pin: {
			pinned,
			pinTitle: pinned ? t("chatView.pinButton.pinned") : t("chatView.pinButton.unpinned"),
			onTogglePin,
		},
		panel: {
			panelOpen,
			panelTitle: panelOpen ? t("chatView.panelButton.open") : t("chatView.panelButton.closed"),
			onTogglePanel,
		},
	};
}
