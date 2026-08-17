import { type MouseEvent, type RefObject, useCallback, useRef, useState } from "react";

export interface MarqueeRect {
	left: number;
	top: number;
	width: number;
	height: number;
}

interface UseMarqueeSelectionParams {
	selectedIds: Set<string>;
	onSelectIds: (ids: Set<string>) => void;
	onClearSelection: () => void;
}

interface UseMarqueeSelectionResult {
	scrollRef: RefObject<HTMLDivElement | null>;
	marquee: MarqueeRect | null;
	onMouseDown: (event: MouseEvent) => void;
}

const DRAG_THRESHOLD = 4;

/**
 * Drag-select on empty space; intersects `[data-knode-id]` children.
 * cmd/ctrl/shift = additive; otherwise clear then select.
 */
export function useMarqueeSelection({
	selectedIds,
	onSelectIds,
	onClearSelection,
}: UseMarqueeSelectionParams): UseMarqueeSelectionResult {
	const scrollRef = useRef<HTMLDivElement>(null);
	const [marquee, setMarquee] = useState<MarqueeRect | null>(null);

	const onMouseDown = useCallback(
		(event: MouseEvent) => {
			if (event.button !== 0) return;
			const target = event.target as HTMLElement;
			if (target.closest("[data-knode]")) return;
			const container = scrollRef.current;
			if (!container) return;

			const cr = container.getBoundingClientRect();
			const toContent = (clientX: number, clientY: number) => ({
				x: clientX - cr.left + container.scrollLeft,
				y: clientY - cr.top + container.scrollTop,
			});
			const start = toContent(event.clientX, event.clientY);
			const additive = event.metaKey || event.ctrlKey || event.shiftKey;
			const base = additive ? new Set(selectedIds) : new Set<string>();
			if (!additive) onClearSelection();

			let moved = false;

			const onMove = (e: globalThis.MouseEvent) => {
				const cur = toContent(e.clientX, e.clientY);
				const left = Math.min(start.x, cur.x);
				const top = Math.min(start.y, cur.y);
				const width = Math.abs(cur.x - start.x);
				const height = Math.abs(cur.y - start.y);
				if (!moved && width < DRAG_THRESHOLD && height < DRAG_THRESHOLD) return;
				moved = true;
				setMarquee({ left, top, width, height });

				const next = new Set(base);
				const right = left + width;
				const bottom = top + height;
				for (const el of container.querySelectorAll<HTMLElement>("[data-knode-id]")) {
					const ir = el.getBoundingClientRect();
					const ix = ir.left - cr.left + container.scrollLeft;
					const iy = ir.top - cr.top + container.scrollTop;
					const intersects = ix < right && ix + ir.width > left && iy < bottom && iy + ir.height > top;
					if (intersects) {
						const id = el.dataset.knodeId;
						if (id) next.add(id);
					}
				}
				onSelectIds(next);
			};

			const onUp = () => {
				window.removeEventListener("mousemove", onMove);
				window.removeEventListener("mouseup", onUp);
				setMarquee(null);
			};

			window.addEventListener("mousemove", onMove);
			window.addEventListener("mouseup", onUp);
		},
		[selectedIds, onSelectIds, onClearSelection],
	);

	return { scrollRef, marquee, onMouseDown };
}
