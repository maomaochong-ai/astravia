export interface SheetCell {
	value: string;
	title: string;
	colSpan: number;
	rowSpan: number;
}

export interface SheetMerge {
	startRow: number;
	endRow: number;
	startColumn: number;
	endColumn: number;
}

export interface SheetModel {
	name: string;
	cells: Map<string, SheetCell>;
	coveredCells: Set<string>;
	merges: SheetMerge[];
	rowHeights: Map<number, number>;
	columnWidths: Map<number, number>;
	rowCount: number;
	columnCount: number;
}

export interface SheetViewport {
	width: number;
	height: number;
	top: number;
	left: number;
}

export interface VisibleRange {
	startRow: number;
	endRow: number;
	startColumn: number;
	endColumn: number;
}
