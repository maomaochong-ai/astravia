import type { JSX } from "react";
import * as XLSX from "xlsx";
import { COLUMN_HEADER_HEIGHT, ROW_HEADER_WIDTH } from "./constants";
import { getColumnWidth, getRowHeight } from "./parseWorkbook";
import { getColumnLeft, getRowTop } from "./sheetGeometry";
import type { SheetModel, SheetViewport, VisibleRange } from "./types";

export function SheetHeaders({
	sheet,
	viewport,
	visible,
}: {
	sheet: SheetModel;
	viewport: SheetViewport;
	visible: VisibleRange;
}): JSX.Element {
	return (
		<>
			<ColumnHeaders sheet={sheet} viewport={viewport} start={visible.startColumn} end={visible.endColumn} />
			<RowHeaders sheet={sheet} viewport={viewport} start={visible.startRow} end={visible.endRow} />
			<SheetCorner viewport={viewport} />
		</>
	);
}

function ColumnHeaders({
	sheet,
	viewport,
	start,
	end,
}: {
	sheet: SheetModel;
	viewport: SheetViewport;
	start: number;
	end: number;
}): JSX.Element {
	return (
		<>
			{Array.from({ length: Math.max(0, end - start) }, (_, offset) => start + offset).map((column) => (
				<div
					key={`column:${column}`}
					className="z-20 inline-flex items-center justify-center border-b border-r border-[var(--border)] bg-[var(--muted)] text-[11px] font-medium text-[var(--muted-foreground)]"
					style={{
						position: "absolute",
						left: getColumnLeft(sheet, column),
						top: viewport.top,
						width: getColumnWidth(sheet, column),
						height: COLUMN_HEADER_HEIGHT,
					}}
				>
					{XLSX.utils.encode_col(column)}
				</div>
			))}
		</>
	);
}

function RowHeaders({
	sheet,
	viewport,
	start,
	end,
}: {
	sheet: SheetModel;
	viewport: SheetViewport;
	start: number;
	end: number;
}): JSX.Element {
	return (
		<>
			{Array.from({ length: Math.max(0, end - start) }, (_, offset) => start + offset).map((row) => (
				<div
					key={`row:${row}`}
					className="z-10 flex items-center justify-center border-b border-r border-[var(--border)] bg-[var(--muted)] text-[11px] tabular-nums text-[var(--muted-foreground)]"
					style={{
						position: "absolute",
						left: viewport.left,
						top: getRowTop(sheet, row),
						width: ROW_HEADER_WIDTH,
						height: getRowHeight(sheet, row),
					}}
				>
					{row + 1}
				</div>
			))}
		</>
	);
}

function SheetCorner({ viewport }: { viewport: SheetViewport }): JSX.Element {
	return (
		<div
			className="z-30 border-b border-r border-[var(--border)] bg-[var(--muted)]"
			style={{
				position: "absolute",
				left: viewport.left,
				top: viewport.top,
				width: ROW_HEADER_WIDTH,
				height: COLUMN_HEADER_HEIGHT,
			}}
		/>
	);
}
