import type { JSX } from "react";
import { createCellKey } from "./cellKeys";
import { getColumnWidth, getRowHeight } from "./parseWorkbook";
import { getColumnLeft, getRowTop } from "./sheetGeometry";
import type { SheetModel, VisibleRange } from "./types";

export function VisibleCells({ sheet, visible }: { sheet: SheetModel; visible: VisibleRange }): JSX.Element {
	const cells: JSX.Element[] = [];
	for (let row = visible.startRow; row < visible.endRow; row++) {
		for (let column = visible.startColumn; column < visible.endColumn; column++) {
			const key = createCellKey(row, column);
			if (sheet.coveredCells.has(key)) continue;
			const cell = sheet.cells.get(key);
			cells.push(
				<div
					key={key}
					title={cell?.title ?? ""}
					className="absolute overflow-hidden whitespace-nowrap border-b border-r border-[var(--border)] bg-[var(--background)] px-2 text-[12px] leading-7 text-[var(--foreground)]"
					style={{
						left: getColumnLeft(sheet, column),
						top: getRowTop(sheet, row),
						width: getSpannedWidth(sheet, column, cell?.colSpan ?? 1),
						height: getSpannedHeight(sheet, row, cell?.rowSpan ?? 1),
					}}
				>
					{cell?.value ?? ""}
				</div>,
			);
		}
	}
	return <>{cells}</>;
}

function getSpannedWidth(sheet: SheetModel, column: number, colSpan: number): number {
	let width = 0;
	for (let offset = 0; offset < colSpan; offset++) width += getColumnWidth(sheet, column + offset);
	return width;
}

function getSpannedHeight(sheet: SheetModel, row: number, rowSpan: number): number {
	let height = 0;
	for (let offset = 0; offset < rowSpan; offset++) height += getRowHeight(sheet, row + offset);
	return height;
}
