import { activeSessionAtom } from "@shared/store/atoms";
import {
	MessageListView as ThemeMessageListView,
	MessageSelectionContextMenuView,
	VirtuosoListContainer,
} from "@astravia/theme-ui/chat";
import { useAtomValue } from "jotai";
import { useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { Virtuoso } from "react-virtuoso";
import { useMessageSelectionContextMenu } from "../../hooks/useMessageSelectionContextMenu";
import { SuggestionBubbles } from "../SuggestionBubbles";
import { ForkOriginBanner, resolveForkOriginPlacement } from "./ForkOriginBanner";
import { MessageItem, ModelSwitchBoundary, ExportMessageList } from "./MessageItem";
import { MessageListFooter } from "./MessageListFooter";
import type { ChatMessage, MessageListModel, MessageListProps } from "./types";

export { ExportMessageList };

const STREAMING_OVERSCAN = 80;
const IDLE_OVERSCAN = 400;
const STREAMING_INCREASE_VIEWPORT_BY = { top: 0, bottom: 80 };
const IDLE_INCREASE_VIEWPORT_BY = { top: 200, bottom: 200 };
const VIRTUOSO_STYLE = { overflowX: "hidden" as const };

export function MessageListView({
	model,
	onAbort,
	onSend,
	sessionId = null,
}: {
	model: MessageListModel;
	onAbort: MessageListProps["onAbort"];
	onSend: MessageListProps["onSend"];
	sessionId?: MessageListProps["sessionId"];
}): JSX.Element {
	const {
		isCompacting,
		isStreaming,
		messages,
		modelSwitchLabels,
		scroll,
		showWaiting,
		tailMessageId,
	} = model;
	const activeSession = useAtomValue(activeSessionAtom);
	const forkOriginPlacement = useMemo(
		() =>
			resolveForkOriginPlacement(
				messages,
				activeSession?.parentEntryId,
				Boolean(activeSession?.parentSessionPath),
			),
		[activeSession?.parentEntryId, activeSession?.parentSessionPath, messages],
	);
	const lastUserMessageId = useMemo(() => {
		const lastUser = [...messages].reverse().find((m) => m.role === "user");
		return lastUser?.id ?? null;
	}, [messages]);
	const itemContent = useCallback(
		(index: number, message: ChatMessage) => {
			const showForkOrigin = forkOriginPlacement?.anchorIndex === index;
			const sourceUser =
				showForkOrigin && forkOriginPlacement
					? messages[forkOriginPlacement.sourceUserIndex]
					: undefined;
			return (
				<div
					data-entry-id={message.entryId ?? message.id}
					className={
						index === messages.length - 1 && message.role === "user" && !showForkOrigin
							? "pb-9"
							: "pb-5"
					}
				>
					{modelSwitchLabels.has(message.id) && (
						<ModelSwitchBoundary label={modelSwitchLabels.get(message.id) as string} />
					)}
					<MessageItem
						message={message}
						isTailMessage={message.id === tailMessageId}
						isStreaming={isStreaming}
						isLastUserMessage={message.id === lastUserMessageId}
						hasAssistantAfter={
							index < messages.length - 1 &&
							messages.slice(index + 1).some((m) => m.role !== "user")
						}
						userMessageEntryState={
							message.id === scroll.activeUserAnimationId
								? "enter"
								: message.id === scroll.pendingUserAnimationId ||
										message.id === scroll.enteringUserMessageId
									? "hidden"
									: "static"
						}
						onUserMessageEntryComplete={
							message.id === scroll.activeUserAnimationId
								? scroll.onUserMessageEntryComplete
								: undefined
						}
						onAbortEdit={onAbort}
					/>
					{showForkOrigin ? <ForkOriginBanner sourceMessage={sourceUser} /> : null}
				</div>
			);
		},
		[
			forkOriginPlacement,
			isStreaming,
			lastUserMessageId,
			messages.length,
			messages,
			modelSwitchLabels,
			onAbort,
			scroll.activeUserAnimationId,
			scroll.enteringUserMessageId,
			scroll.onUserMessageEntryComplete,
			scroll.pendingUserAnimationId,
			tailMessageId,
		],
	);
	const footer = useCallback(
		() => (
			// Workflow footer sits above input-suggestion capsules; pb-16 clears the floating InputBar.
			<div className="pb-16">
				<MessageListFooter
					isCompacting={isCompacting}
					showWaiting={showWaiting}
					showWorkflows={sessionId != null}
				/>
				{onSend && <SuggestionBubbles onSend={onSend} />}
			</div>
		),
		[isCompacting, showWaiting, onSend, sessionId],
	);
	const components = useMemo(
		() => ({ List: VirtuosoListContainer, Footer: footer }),
		[footer],
	);
	const selectionMenu = useMessageSelectionContextMenu();

	return (
		<>
			<div
				ref={selectionMenu.containerRef}
				className="flex min-h-0 flex-1 flex-col"
				onContextMenuCapture={selectionMenu.onContextMenuCapture}
			>
				<ThemeMessageListView
					virtuoso={
						<Virtuoso
							ref={scroll.virtuosoRef}
							scrollerRef={scroll.scrollerRef}
							data={messages}
							className="flex-1 pt-2"
							style={VIRTUOSO_STYLE}
							atBottomStateChange={scroll.onAtBottomChange}
							atBottomThreshold={80}
							overscan={isStreaming ? STREAMING_OVERSCAN : IDLE_OVERSCAN}
							increaseViewportBy={
								isStreaming ? STREAMING_INCREASE_VIEWPORT_BY : IDLE_INCREASE_VIEWPORT_BY
							}
							defaultItemHeight={80}
							components={components}
							itemContent={itemContent}
							initialTopMostItemIndex={messages.length > 0 ? messages.length - 1 : 0}
						/>
					}
				/>
			</div>
			{selectionMenu.contextMenu
				? createPortal(
						<MessageSelectionContextMenuView {...selectionMenu.contextMenu} />,
						document.body,
					)
				: null}
		</>
	);
}

// re-export for any external consumers that used the local container
export const MessageListVirtuosoListContainer = VirtuosoListContainer;
