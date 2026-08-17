import type { CardDescriptor, PluginCardProps } from "@astravia-org/plugin-sdk";
import { chatMessagesAtom, pluginCardRenderersAtom, type RegisteredCardRenderer } from "@shared/store/atoms";
import type { ChatMessage, ContentBlock } from "@shared/store/chat-atoms";
import { useAtomValue } from "jotai";
import type { ComponentType, ReactNode } from "react";
import { useMemo } from "react";
import { usePluginTextResolver } from "../../plugins/runtime/plugin-i18n";
import type { ResolvedCard } from "../components/MessageCards";

/** A card descriptor with its anchoring message and in-flight flag. */
interface RawCard {
	descriptor: CardDescriptor;
	pending: boolean;
	anchorId: string;
}

/**
 * Cards a single message contributes, in display order:
 *  - settled — each tool_call block's `cards` (from its result's details.cards).
 *  - pending — for each in-flight tool_call, every renderer's `pendingFor` gets
 *    a shot at synthesizing a provisional descriptor.
 */
function cardsForMessage(message: ChatMessage, renderers: RegisteredCardRenderer[]): RawCard[] {
	const blocks: ContentBlock[] = message.blocks ?? [];
	const cards: RawCard[] = [];
	for (const block of blocks) {
		if (block.type !== "tool_call") continue;
		if (block.status === "pending") {
			const toolCall = { toolName: block.toolName, args: block.args ?? {} };
			for (const renderer of renderers) {
				const descriptor = renderer.pendingFor?.(toolCall);
				if (descriptor) cards.push({ descriptor, pending: true, anchorId: message.id });
			}
		} else if (block.cards) {
			for (const descriptor of block.cards) cards.push({ descriptor, pending: false, anchorId: message.id });
		}
	}
	return cards;
}

export interface MessageCardsHostModel {
	cards: ResolvedCard[];
	convMessage: { id: string; role: ChatMessage["role"]; text: string; timestamp?: number };
}

export function useMessageCardsHostModel(message: ChatMessage): MessageCardsHostModel | null {
	const renderers = useAtomValue(pluginCardRenderersAtom);
	const messages = useAtomValue(chatMessagesAtom);
	const trPlugin = usePluginTextResolver();

	const rendererByType = useMemo<Map<string, RegisteredCardRenderer>>(() => {
		const map = new Map<string, RegisteredCardRenderer>();
		for (const renderer of renderers) map.set(renderer.type, renderer);
		return map;
	}, [renderers]);

	const latestOwnerByKey = useMemo<Map<string, string>>(() => {
		const owner = new Map<string, string>();
		for (const m of messages) {
			for (const card of cardsForMessage(m, renderers)) {
				if (card.descriptor.key) owner.set(card.descriptor.key, m.id);
			}
		}
		return owner;
	}, [messages, renderers]);

	const cards = useMemo<ResolvedCard[]>(() => {
		const raw = cardsForMessage(message, renderers);
		const owned = raw.filter((c) => !c.descriptor.key || latestOwnerByKey.get(c.descriptor.key) === message.id);
		const lastIndexByKey = new Map<string, number>();
		owned.forEach((c, i) => {
			if (c.descriptor.key) lastIndexByKey.set(c.descriptor.key, i);
		});
		const resolved: ResolvedCard[] = [];
		owned.forEach((c, i) => {
			if (c.descriptor.key && lastIndexByKey.get(c.descriptor.key) !== i) return;
			const renderer = rendererByType.get(c.descriptor.type);
			if (!renderer) return;
			const rawTitle = c.descriptor.title ?? renderer.title;
			resolved.push({
				id: `${c.anchorId}:${c.descriptor.type}:${c.descriptor.key ?? i}`,
				pluginId: renderer.pluginId,
				descriptor: c.descriptor,
				pending: c.pending,
				Component: renderer.component as ComponentType<PluginCardProps>,
				title: rawTitle ? trPlugin(renderer.pluginId, rawTitle) : renderer.pluginId,
				icon: renderer.icon as ReactNode,
			});
		});
		return resolved;
	}, [message, renderers, rendererByType, latestOwnerByKey, trPlugin]);

	if (cards.length === 0) return null;

	return {
		cards,
		convMessage: { id: message.id, role: message.role, text: message.text, timestamp: message.timestamp },
	};
}
