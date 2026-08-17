import { COLUMN_HEADER_HEIGHT, ROW_HEADER_WIDTH } from "./constants";
import { getColumnWidth, getRowHeight } from "./parseWorkbook";
import type { SheetModel, VisibleRange } from "./types";

export function getRowTop(sheet: SheetModel, row: number): number {
	let top = COLUMN_HEADER_HEIGHT;
	for (let index = 0; index < row; index++) top += getRowHeight(sheet, index);
	return top;
}

export function getColumnLeft(sheet: SheetModel, column: number): number {
	let left = ROW_HEADER_WIDTH;
	for (let index = 0; index < column; index++) left += getColumnWidth(sheet, index);
	return left;
}

export function getSheetWidth(sheet: SheetModel): number {
	return ROW_HEADER_WIDTH + Array.from({ length: sheet.columnCount }, (_, column) => getColumnWidth(sheet, column)).reduce(sum, 0);
}

export function getSheetHeight(sheet: SheetModel): number {
	return COLUMN_HEADER_HEIGHT + Array.from({ length: sheet.rowCount }, (_, row) => getRowHeight(sheet, row)).reduce(sum, 0);
}

export function getVisibleRange(sheet: SheetModel, viewportTop: number, viewportLeft: number, viewportHeight: number, viewportWidth: number, overscan: number): VisibleRange {
	return {
		startRow: findStartRow(sheet, viewportTop, overscan),
		endRow: findEndRow(sheet, viewportTop + viewportHeight, overscan),
		startColumn: findStartColumn(sheet, viewportLeft, overscan),
		endColumn: findEndColumn(sheet, viewportLeft + viewportWidth, overscan),
	};
}

function findStartRow(sheet: SheetModel, top: number, overscan: number): number {
	let offset = COLUMN_HEADER_HEIGHT;
	for (let row = 0; row < sheet.rowCount; row++) {
		offset += getRowHeight(sheet, row);
		if (offset >= top) return Math.max(0, row - overscan);
	}
	return 0;
}

function findEndRow(sheet: SheetModel, bottom: number, overscan: number): number {
	let offset = COLUMN_HEADER_HEIGHT;
	for (let row = 0; row < sheet.rowCount; row++) {
		offset += getRowHeight(sheet, row);
		if (offset > bottom) return Math.min(sheet.rowCount, row + 1 + overscan);
	}
	return sheet.rowCount;
}

function findStartColumn(sheet: SheetModel, left: number, overscan: number): number {
	let offset = ROW_HEADER_WIDTH;
	for (let column = 0; column < sheet.columnCount; column++) {
		offset += getColumnWidth(sheet, column);
		if (offset >= left) return Math.max(0, column - overscan);
	}
	return 0;
}

function findEndColumn(sheet: SheetModel, right: number, overscan: number): number {
	let offset = ROW_HEADER_WIDTH;
	for (let column = 0; column < sheet.columnCount; column++) {
		offset += getColumnWidth(sheet, column);
		if (offset > right) return Math.min(sheet.columnCount, column + 1 + overscan);
	}
	return sheet.columnCount;
}

function sum(total: number, value: number): number {
	return total + value;
}
