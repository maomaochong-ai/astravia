import * as XLSX from "xlsx";
import { DEFAULT_COLUMN_WIDTH, DEFAULT_ROW_HEIGHT, MAX_COLUMN_WIDTH, MIN_COLUMN_WIDTH } from "./constants";
import { createCellKey } from "./cellKeys";
import type { SheetCell, SheetMerge, SheetModel } from "./types";

const MIN_ROW_COUNT = 100;
const MIN_COLUMN_COUNT = 26;

export function parseWorkbook(bytes: ArrayBuffer): SheetModel[] {
	const workbook = XLSX.read(bytes, { type: "array", cellDates: true, cellStyles: true });
	return workbook.SheetNames.map((name) => {
		const worksheet = workbook.Sheets[name];
		const range = worksheet["!ref"] ? XLSX.utils.decode_range(worksheet["!ref"]) : null;
		const merges = parseMerges(worksheet);
		const cells = parseCells(worksheet, merges);
		const coveredCells = parseCoveredCells(merges);
		return {
			name,
			cells,
			coveredCells,
			merges,
			rowHeights: parseRowHeights(worksheet),
			columnWidths: parseColumnWidths(worksheet),
			rowCount: Math.max(MIN_ROW_COUNT, range ? range.e.r + 1 : 0),
			columnCount: Math.max(MIN_COLUMN_COUNT, range ? range.e.c + 1 : 0),
		};
	});
}

function parseCells(worksheet: XLSX.WorkSheet, merges: SheetMerge[]): Map<string, SheetCell> {
	const cells = new Map<string, SheetCell>();
	for (const address of Object.keys(worksheet)) {
		if (address.startsWith("!")) continue;
		const position = XLSX.utils.decode_cell(address);
		const sourceCell = worksheet[address];
		const value = formatCellValue(sourceCell);
		if (value.length === 0) continue;
		const merge = findMerge(merges, position.r, position.c);
		cells.set(createCellKey(position.r, position.c), {
			value,
			title: createCellTitle(sourceCell, value),
			colSpan: merge && isMergeOrigin(merge, position.r, position.c) ? merge.endColumn - merge.startColumn + 1 : 1,
			rowSpan: merge && isMergeOrigin(merge, position.r, position.c) ? merge.endRow - merge.startRow + 1 : 1,
		});
	}
	return cells;
}

function formatCellValue(cell: XLSX.CellObject): string {
	if (typeof cell.w === "string") return cell.w;
	if (cell.t === "d" && cell.v instanceof Date) return cell.v.toLocaleDateString();
	if (cell.v == null) return "";
	return String(cell.v);
}

function createCellTitle(cell: XLSX.CellObject, value: string): string {
	if (typeof cell.f === "string" && cell.f.length > 0) {
		return `${value}\n=${cell.f}`;
	}
	return value;
}

function parseMerges(worksheet: XLSX.WorkSheet): SheetMerge[] {
	return (worksheet["!merges"] ?? []).map((range) => ({
		startRow: range.s.r,
		endRow: range.e.r,
		startColumn: range.s.c,
		endColumn: range.e.c,
	}));
}

function parseCoveredCells(merges: SheetMerge[]): Set<string> {
	const covered = new Set<string>();
	for (const merge of merges) {
		for (let row = merge.startRow; row <= merge.endRow; row++) {
			for (let column = merge.startColumn; column <= merge.endColumn; column++) {
				if (isMergeOrigin(merge, row, column)) continue;
				covered.add(createCellKey(row, column));
			}
		}
	}
	return covered;
}

function parseRowHeights(worksheet: XLSX.WorkSheet): Map<number, number> {
	const heights = new Map<number, number>();
	worksheet["!rows"]?.forEach((row, index) => {
		if (row.hidden) heights.set(index, 0);
		else if (typeof row.hpx === "number") heights.set(index, row.hpx);
	});
	return heights;
}

function parseColumnWidths(worksheet: XLSX.WorkSheet): Map<number, number> {
	const widths = new Map<number, number>();
	worksheet["!cols"]?.forEach((column, index) => {
		if (column.hidden) {
			widths.set(index, 0);
			return;
		}
		const width = column.wpx ?? (typeof column.wch === "number" ? Math.round(column.wch * 8) : undefined);
		if (typeof width === "number") widths.set(index, Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, width)));
	});
	return widths;
}

function findMerge(merges: SheetMerge[], row: number, column: number): SheetMerge | undefined {
	return merges.find(
		(merge) =>
			row >= merge.startRow && row <= merge.endRow && column >= merge.startColumn && column <= merge.endColumn,
	);
}

function isMergeOrigin(merge: SheetMerge, row: number, column: number): boolean {
	return merge.startRow === row && merge.startColumn === column;
}

export function getRowHeight(sheet: SheetModel, row: number): number {
	return sheet.rowHeights.get(row) ?? DEFAULT_ROW_HEIGHT;
}

export function getColumnWidth(sheet: SheetModel, column: number): number {
	return sheet.columnWidths.get(column) ?? DEFAULT_COLUMN_WIDTH;
}
