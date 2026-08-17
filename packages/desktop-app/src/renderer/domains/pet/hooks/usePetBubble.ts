import { useCallback, useEffect, useRef, useState } from "react";
import type { PetBubblePriority, PetCommandSource } from "../../../../shared/pet-ipc";
import type { PetSpeechBubbleMessage } from "../components/PetSpeechBubble";

const DEFAULT_BUBBLE_TTL_MS = 4_000;
const MIN_BUBBLE_TTL_MS = 1_000;
const MAX_BUBBLE_TTL_MS = 15_000;

interface PetBubbleState extends PetSpeechBubbleMessage {
	source: PetCommandSource;
	priority: PetBubblePriority;
}

export interface ShowPetBubbleInput {
	text: string;
	source?: PetCommandSource;
	ttlMs?: number;
	priority?: PetBubblePriority;
}

function normalizeBubbleTtl(ttlMs: number | undefined): number {
	if (typeof ttlMs !== "number" || !Number.isFinite(ttlMs)) return DEFAULT_BUBBLE_TTL_MS;
	return Math.min(MAX_BUBBLE_TTL_MS, Math.max(MIN_BUBBLE_TTL_MS, ttlMs));
}

export function usePetBubble(): {
	bubble: PetSpeechBubbleMessage | undefined;
	showBubble: (input: ShowPetBubbleInput) => void;
	hideBubble: (source?: PetCommandSource) => void;
} {
	const [bubble, setBubble] = useState<PetBubbleState | undefined>();
	const bubbleRef = useRef<PetBubbleState | undefined>(undefined);
	const timerRef = useRef<number | undefined>(undefined);
	const userBubbleUntilRef = useRef(0);

	const clearBubbleTimer = useCallback(() => {
		if (timerRef.current == null) return;
		window.clearTimeout(timerRef.current);
		timerRef.current = undefined;
	}, []);

	const hideBubble = useCallback(
		(source?: PetCommandSource) => {
			const current = bubbleRef.current;
			if (source === "app" && current?.source === "user") return;
			clearBubbleTimer();
			bubbleRef.current = undefined;
			setBubble(undefined);
		},
		[clearBubbleTimer],
	);

	const showBubble = useCallback(
		(input: ShowPetBubbleInput) => {
			const text = input.text.trim();
			if (!text) return;

			const source = input.source ?? "app";
			const priority = input.priority ?? "normal";
			if (source === "app" && priority !== "high" && Date.now() < userBubbleUntilRef.current) return;

			const ttlMs = normalizeBubbleTtl(input.ttlMs);
			const current = bubbleRef.current;

			const next: PetBubbleState = { text, source, priority };
			if (source === "user") {
				userBubbleUntilRef.current = Date.now() + ttlMs;
			}
			clearBubbleTimer();
			bubbleRef.current = next;
			if (current?.text !== text || current.source !== source || current.priority !== priority) {
				setBubble(next);
			}
			timerRef.current = window.setTimeout(() => {
				timerRef.current = undefined;
				bubbleRef.current = undefined;
				setBubble(undefined);
			}, ttlMs);
		},
		[clearBubbleTimer],
	);

	useEffect(() => clearBubbleTimer, [clearBubbleTimer]);

	return { bubble, showBubble, hideBubble };
}
