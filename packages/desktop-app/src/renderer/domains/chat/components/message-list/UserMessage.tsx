import type { ChatMessage } from "@shared/store/atoms";
import {
	UserMessageContextMenuView,
	UserMessageView,
	type UserMessageEntryState,
} from "@astravia/theme-ui/chat";
import { memo } from "react";
import { createPortal } from "react-dom";
import { useUserMessageModel } from "../../hooks/useUserMessageModel";

export type { UserMessageEntryState };

interface UserMessageProps {
	entryState: UserMessageEntryState;
	hasAssistantAfter?: boolean;
	isLastUserMessage?: boolean;
	isStreaming?: boolean;
	message: ChatMessage;
	onAbortEdit?: () => void;
	onEntryComplete?: () => void;
}

export const UserMessage = memo(function UserMessage(props: UserMessageProps) {
	const { contextMenu, ...viewModel } = useUserMessageModel(props);
	return (
		<>
			<UserMessageView {...viewModel} />
			{contextMenu ? createPortal(<UserMessageContextMenuView {...contextMenu} />, document.body) : null}
		</>
	);
});
