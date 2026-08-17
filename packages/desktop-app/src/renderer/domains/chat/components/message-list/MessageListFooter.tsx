import { memo } from "react";
import { useTranslation } from "react-i18next";
import { MessageListFooterView } from "@astravia/theme-ui/chat";
import { PluginTurnCardHost } from "../../../plugins/components/PluginTurnCardHost";
import { StreamingIndicator } from "./AssistantMessage";
import { WorkflowFooterItems } from "./WorkflowFooterItems";

export const MessageListFooter = memo(function MessageListFooter({
	isCompacting,
	showWaiting,
	showWorkflows = false,
}: {
	isCompacting: boolean;
	showWaiting: boolean;
	/** Only the live chat list shows workflow items (not read-only viewers). */
	showWorkflows?: boolean;
}) {
	const { t } = useTranslation("chat");
	return (
		<MessageListFooterView
			compactionLabel={t("messageList.compactionIndicator")}
			isCompacting={isCompacting}
			showWaiting={showWaiting}
			streamingIndicator={<StreamingIndicator />}
			workflowItems={showWorkflows ? <WorkflowFooterItems /> : undefined}
			pluginHost={<PluginTurnCardHost />}
		/>
	);
});
