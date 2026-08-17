import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useRef, useState } from "react";

/**
 * 对话界面背景水波纹反馈：点击背景空白处（非交互元素）时，
 * 在点击坐标生成一个扩散圆环，动画结束后移除。
 *
 * 涟漪宿主需为 `relative z-0` 容器，涟漪元素以 `-z-10` 挂在内容之下、
 * 宿主背景之上，因此只会透出于透明空白区域，不会遮挡消息内容。
 */

const MAX_RIPPLES = 5;
const RIPPLE_DURATION_MS = 600;

const INTERACTIVE_SELECTOR = [
	"button",
	"a",
	"input",
	"textarea",
	"select",
	"label",
	"[contenteditable]",
	"[role='button']",
	"[role='menuitem']",
	"[role='option']",
].join(",");

interface BackgroundRipple {
	readonly id: number;
	readonly x: number;
	readonly y: number;
}

export interface ChatBackgroundRippleHandlers {
	readonly onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
	readonly ripples: readonly BackgroundRipple[];
}

export function useChatBackgroundRipple(): ChatBackgroundRippleHandlers {
	const [ripples, setRipples] = useState<BackgroundRipple[]>([]);
	const nextIdRef = useRef(0);

	const removeRipple = useCallback((id: number) => {
		setRipples((current) => current.filter((ripple) => ripple.id !== id));
	}, []);

	const onPointerDown = useCallback(
		(event: ReactPointerEvent<HTMLDivElement>) => {
			const target = event.target as HTMLElement;
			if (target.closest(INTERACTIVE_SELECTOR)) return;

			const rect = event.currentTarget.getBoundingClientRect();
			const id = nextIdRef.current + 1;
			nextIdRef.current = id;

			setRipples((current) => [
				...current.slice(-(MAX_RIPPLES - 1)),
				{ id, x: event.clientX - rect.left, y: event.clientY - rect.top },
			]);
			window.setTimeout(() => removeRipple(id), RIPPLE_DURATION_MS);
		},
		[removeRipple],
	);

	return { onPointerDown, ripples };
}
