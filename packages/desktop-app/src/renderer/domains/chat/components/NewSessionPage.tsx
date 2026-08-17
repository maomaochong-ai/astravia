import { useThemeSurface } from "@astravia/theme-sdk/appearance";
import { ChatHeaderActionsView } from "@astravia/theme-ui/chat";
import { pageHeaderRightSlotAtom } from "@shared/store/atoms";
import { useSetAtom } from "jotai";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { BackgroundTasksBadge } from "./BackgroundTasksBadge";
import { SandboxGrantsBadge } from "./SandboxGrantsBadge";
import { NewSessionPageView } from "./new-session/NewSessionPageView";
import { useNewSessionPageModel } from "./new-session/useNewSessionPageModel";

export function NewSessionPage(): JSX.Element {
	const { t } = useTranslation("chat");
	const surface = useThemeSurface("chat.newSessionPage");
	const model = useNewSessionPageModel();
	const setHeaderRightSlot = useSetAtom(pageHeaderRightSlotAtom);

	const headerActions = useMemo(
		() => (
			<ChatHeaderActionsView
				badges={
					<>
						<BackgroundTasksBadge />
						<SandboxGrantsBadge />
					</>
				}
				// 新建会话没有可导出的消息：导出按钮保持禁用，与对话页同一组件同一布局。
				exportTitle={t("chatView.exportButton.title")}
				exportDisabled
				exporting={false}
				onOpenExport={() => {}}
				pinTitle={model.winHeader.pin.pinTitle}
				pinned={model.winHeader.pin.pinned}
				onTogglePin={model.winHeader.pin.onTogglePin}
				panelTitle={model.winHeader.panel.panelTitle}
				panelOpen={model.winHeader.panel.panelOpen}
				onTogglePanel={model.winHeader.panel.onTogglePanel}
			/>
		),
		[model.winHeader, t],
	);

	useEffect(() => {
		setHeaderRightSlot(headerActions);
		return () => setHeaderRightSlot(null);
	}, [headerActions, setHeaderRightSlot]);

	return <NewSessionPageView {...model} className={surface?.rootClassName} />;
}
