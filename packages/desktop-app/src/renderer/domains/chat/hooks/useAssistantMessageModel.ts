import type { ChatMessage, TextBlock } from "@shared/store/atoms";
import { activeSessionAtom, agentModeAtom, pluginToolCallSlotsAtom, promptPredictingAtom } from "@shared/store/atoms";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import {
	findLastProcessBlockIndex,
	getAssistantFoldData,
	groupBlocks,
} from "../components/message-list/messageBlockModel";
import { groupBlocksForWork } from "../components/message-list/progressGroupModel";
import type { AssistantMessageModel } from "../components/message-list/types";

interface AssistantMessageModelInput {
	expanded: boolean;
	exportMode: boolean;
	isStreaming: boolean;
	isTailMessage: boolean;
	message: ChatMessage;
}

export function useAssistantMessageModel({
	expanded,
	exportMode,
	isStreaming,
	isTailMessage,
	message,
}: AssistantMessageModelInput): AssistantMessageModel {
	const activeRuntimeId = useAtomValue(activeSessionAtom)?.runtimeId;
	const toolCallSlots = useAtomValue(pluginToolCallSlotsAtom);
	const predictingMap = useAtomValue(promptPredictingAtom);
	const customToolNames = useMemo(() => new Set(toolCallSlots.map((slot) => slot.toolName)), [toolCallSlots]);
	const isCurrentlyStreaming = isTailMessage && isStreaming;
	const isWorkMode = useAtomValue(agentModeAtom) === "work";
	const foldData = useMemo(
		() => getAssistantFoldData(message.blocks ?? [], customToolNames),
		[message.blocks, customToolNames],
	);
	const visibleBlocks = useMemo(() => {
		// 收起时渲染整个答案区（含插件产物卡片），而不是只留文本。
		if (exportMode && foldData) return foldData.answerBlocks;
		if (!foldData || expanded || isCurrentlyStreaming) return message.blocks ?? [];
		return foldData.answerBlocks;
	}, [expanded, exportMode, foldData, isCurrentlyStreaming, message.blocks]);
	const segments = useMemo(
		() =>
			isWorkMode
				? groupBlocksForWork(visibleBlocks, customToolNames, isCurrentlyStreaming)
				: groupBlocks(visibleBlocks, customToolNames),
		[isWorkMode, visibleBlocks, customToolNames, isCurrentlyStreaming],
	);
	// Work 折叠条按「阶段数」计数，而不是 coding 的原始 block 数——用户看到的单位就是阶段。
	const workFoldCount = useMemo(() => {
		if (!isWorkMode || !foldData) return 0;
		const processSegments = groupBlocksForWork(foldData.processBlocks, customToolNames);
		return processSegments.filter((segment) => segment.type === "progress_group" || segment.type === "tool_group")
			.length;
	}, [isWorkMode, foldData, customToolNames]);
	const exportProcessSegments = useMemo(
		() => (exportMode && foldData ? groupBlocks(foldData.processBlocks, customToolNames) : []),
		[customToolNames, exportMode, foldData],
	);
	const streamingTailIndex = useMemo(() => {
		if (!isCurrentlyStreaming) return -1;
		for (let index = segments.length - 1; index >= 0; index--) {
			const segment = segments[index];
			if (segment.type === "single" && segment.block.type === "text" && segment.block.text.length > 0) {
				return index;
			}
		}
		return -1;
	}, [segments, isCurrentlyStreaming]);
	const conclusionText = useMemo(() => {
		const blocks = message.blocks ?? [];
		if (blocks.length === 0) return (message.text ?? "").trim();
		const foldData = getAssistantFoldData(blocks, customToolNames);
		if (foldData) {
			return foldData.outputBlocks
				.map((block) => block.text.trim())
				.filter(Boolean)
				.join("\n\n");
		}
		if (findLastProcessBlockIndex(blocks, customToolNames) !== -1) return "";
		return blocks
			.filter((block): block is TextBlock => block.type === "text")
			.map((block) => block.text.trim())
			.filter(Boolean)
			.join("\n\n");
	}, [message, customToolNames]);

	return {
		conclusionText,
		exportProcessSegments,
		foldData,
		isCurrentlyStreaming,
		isPredicting:
			isTailMessage && !isCurrentlyStreaming && Boolean(activeRuntimeId && predictingMap[activeRuntimeId]),
		isWorkMode,
		workFoldCount,
		segments,
		showDuration: Boolean(message.durationSeconds && message.durationSeconds > 0) && !isCurrentlyStreaming,
		streamingTailIndex,
	};
}
