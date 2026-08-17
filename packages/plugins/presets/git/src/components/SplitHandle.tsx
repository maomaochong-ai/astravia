import { useRef } from "react";

/**
 * Thin vertical drag handle for the tree/diff splitter. Reports incremental
 * horizontal deltas; the parent clamps and applies the width.
 */
export function SplitHandle({ onDrag }: { onDrag: (deltaX: number) => void }): JSX.Element {
	const lastX = useRef(0);

	const onPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
		event.preventDefault();
		lastX.current = event.clientX;
		const move = (ev: PointerEvent): void => {
			onDrag(ev.clientX - lastX.current);
			lastX.current = ev.clientX;
		};
		const up = (): void => {
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", up);
		};
		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", up);
	};

	return (
		<div
			onPointerDown={onPointerDown}
			className="absolute right-0 top-0 z-10 h-full w-1 cursor-col-resize bg-transparent transition-colors hover:bg-accent"
		/>
	);
}
