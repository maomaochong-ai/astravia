import type { ChatMessage } from "@shared/store/atoms";
import { MessageCardsHostView } from "@astravia/theme-ui/chat";
import { useMessageCardsHostModel } from "../hooks/useMessageCardsHostModel";
import { MessageCards } from "./MessageCards";

/**
 * Mounts the plugin card area beneath a single (assistant) message.
 */
export function MessageCardsHost({ message }: { message: ChatMessage }): JSX.Element | null {
	const model = useMessageCardsHostModel(message);
	if (!model) return null;
	return (
		<MessageCardsHostView>
			<MessageCards cards={model.cards} message={model.convMessage} />
		</MessageCardsHostView>
	);
}
