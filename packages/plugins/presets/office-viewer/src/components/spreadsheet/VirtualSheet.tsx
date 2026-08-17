import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import { OVERSCAN } from "./constants";
import { SheetHeaders } from "./SheetHeaders";
import { getSheetHeight, getSheetWidth, getVisibleRange } from "./sheetGeometry";
import type { SheetModel, SheetViewport } from "./types";
import { VisibleCells } from "./VisibleCells";

const INITIAL_VIEWPORT: SheetViewport = { width: 0, height: 0, top: 0, left: 0 };

export function VirtualSheet({ sheet }: { sheet: SheetModel }): JSX.Element {
	const scrollerRef = useRef<HTMLDivElement | null>(null);
	const [viewport, setViewport] = useState<SheetViewport>(INITIAL_VIEWPORT);

	useEffect(() => {
		const element = scrollerRef.current;
		if (!element) return;
		const updateSize = () =>
			setViewport((current) => ({
				...current,
				width: element.clientWidth,
				height: element.clientHeight,
			}));
		updateSize();
		const observer = new ResizeObserver(updateSize);
		observer.observe(element);
		return () => observer.disconnect();
	}, []);

	const visible = useMemo(
		() => getVisibleRange(sheet, viewport.top, viewport.left, viewport.height, viewport.width, OVERSCAN),
		[sheet, viewport],
	);

	return (
		<div
			ref={scrollerRef}
			className="relative min-h-0 flex-1 overflow-auto bg-[var(--background)]"
			onScroll={(event) => {
				const element = event.currentTarget;
				setViewport((current) => ({ ...current, top: element.scrollTop, left: element.scrollLeft }));
			}}
		>
			<div
				className="relative"
				style={{
					width: getSheetWidth(sheet),
					height: getSheetHeight(sheet),
				}}
			>
				<VisibleCells sheet={sheet} visible={visible} />
				<SheetHeaders sheet={sheet} viewport={viewport} visible={visible} />
			</div>
		</div>
	);
}
