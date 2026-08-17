import { useChatPageModel } from "../hooks/useChatPageModel";
import { useSessionManager } from "../hooks/useSessionManager";
import { ChatPageView } from "./chat-page/ChatPageView";

export function ChatPage(): JSX.Element | null {
	const model = useChatPageModel();
	const { sendMessage, abortMessage, sendQueuedNow } = useSessionManager();

	return (
		<ChatPageView model={model} onSend={sendMessage} onAbort={abortMessage} onSendQueued={sendQueuedNow} />
	);
}
