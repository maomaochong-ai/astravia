/**
 * 结果网格纯函数（B2.6）。
 * dbx 以 Markdown 表格回传，所有值均为字符串；列展示类型按值推断。
 */

export type ResultColumnKind = "number" | "boolean" | "text" | "empty";

const BOOLEAN_VALUES = new Set(["true", "false", "t", "f", "yes", "no"]);

function isNumberCell(value: string): boolean {
	const trimmed = value.trim();
	if (trimmed === "") return false;
	return Number.isFinite(Number(trimmed));
}

/** 按列值推断展示类型：全空 → empty；全数字 → number；全布尔 → boolean；其余 → text。 */
export function inferColumnKind(values: readonly (string | null | undefined)[]): ResultColumnKind {
	let sawValue = false;
	let allNumber = true;
	let allBoolean = true;
	for (const raw of values) {
		if (raw === null || raw === undefined || raw.trim() === "") continue;
		sawValue = true;
		if (allNumber && !isNumberCell(raw)) allNumber = false;
		if (allBoolean && !BOOLEAN_VALUES.has(raw.trim().toLowerCase())) allBoolean = false;
		if (!allNumber && !allBoolean) break;
	}
	if (!sawValue) return "empty";
	if (allNumber) return "number";
	if (allBoolean) return "boolean";
	return "text";
}

export const RESULT_CELL_MAX_CHARS = 200;

/** 单元格截断（网格展示截断文本，title 悬停看全文）。 */
export function truncateCell(value: string, max = RESULT_CELL_MAX_CHARS): string {
	return value.length <= max ? value : `${value.slice(0, max)}…`;
}

/** 空值判定（Markdown 空串按 NULL 展示）。 */
export function isNullCell(value: string | null | undefined): boolean {
	return value === null || value === undefined || value.trim() === "";
}

export type SortDirection = "asc" | "desc";

/** 排序指示：未排序 → 升序 → 降序 → 未排序 循环。 */
export function nextSortDirection(current: SortDirection | null): SortDirection | null {
	if (current === null) return "asc";
	if (current === "asc") return "desc";
	return null;
}

/** 按列值排序（V4-③）：数字列数值比较，其余 localeCompare；不修改原数组。 */
export function sortRows(
	rows: readonly Record<string, string>[],
	columns: readonly string[],
	column: string,
	direction: SortDirection,
	columnKinds: readonly ResultColumnKind[],
): Array<Record<string, string>> {
	const index = columns.indexOf(column);
	const kind = index >= 0 ? (columnKinds[index] ?? "text") : "text";
	const sorted = [...rows];
	sorted.sort((a, b) => {
		const av = a[column] ?? "";
		const bv = b[column] ?? "";
		let cmp: number;
		if (kind === "number") {
			const an = Number(av.trim());
			const bn = Number(bv.trim());
			const anFinite = Number.isFinite(an);
			const bnFinite = Number.isFinite(bn);
			if (anFinite && bnFinite) cmp = an - bn;
			else if (anFinite) cmp = -1;
			else if (bnFinite) cmp = 1;
			else cmp = av.localeCompare(bv);
		} else {
			cmp = av.localeCompare(bv);
		}
		return direction === "asc" ? cmp : -cmp;
	});
	return sorted;
}

/** 转义单个 CSV 字段：含逗号/引号/换行时用引号包裹，内部引号翻倍。 */
export function escapeCsvField(value: string): string {
	if (/[,"\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
	return value;
}

/** 结果集 → CSV 文本（V4-① 导出）：首行列名，CRLF 行尾，NULL 导出为空串。 */
export function rowsToCsv(columns: readonly string[], rows: readonly Record<string, string>[]): string {
	const header = columns.map((column) => escapeCsvField(column)).join(",");
	const lines = rows.map((row) => columns.map((column) => escapeCsvField(row[column] ?? "")).join(","));
	return [header, ...lines].join("\r\n");
}

/** 结果集 → TSV 文本（V4-① 复制到剪贴板）：制表符分隔，便于粘贴进表格应用。 */
export function rowsToTsv(columns: readonly string[], rows: readonly Record<string, string>[]): string {
	const header = columns.map((column) => escapeCsvField(column)).join("\t");
	const lines = rows.map((row) => columns.map((column) => escapeCsvField(row[column] ?? "")).join("\t"));
	return [header, ...lines].join("\n");
}

/** 结果集 → JSON 文本（V4-① 导出）：数组对象（键 = 列名，NULL 导出为 null）。 */
export function rowsToJson(columns: readonly string[], rows: readonly Record<string, string>[]): string {
	return JSON.stringify(
		rows.map((row) => {
			const entry: Record<string, string | null> = {};
			for (const column of columns) {
				const raw = row[column];
				entry[column] = isNullCell(raw) ? null : raw;
			}
			return entry;
		}),
		null,
		2,
	);
}

/** 导出文件名（V4-①）：result-<时间戳>.<ext>。 */
export function exportFileName(ext: string): string {
	const stamp = new Date().toISOString().replace(/[:.]/g, "-");
	return `result-${stamp}.${ext}`;
}

/** 分页总页数（客户端分页，作用于已加载结果）；空集或非法页大小按 1 页处理。 */
export function pageCount(total: number, pageSize: number): number {
	if (total <= 0 || pageSize <= 0) return 1;
	return Math.ceil(total / pageSize);
}

/** 把页码夹到 [1, totalPages]；结果变化后旧页码越界时用此值兜底。 */
export function clampPage(page: number, total: number, pageSize: number): number {
	return Math.min(Math.max(1, page), Math.max(1, pageCount(total, pageSize)));
}

/** 取第 page 页的行切片（page 假定已由 clampPage 归一；不修改原数组）。 */
export function pageSlice<T>(rows: readonly T[], page: number, pageSize: number): T[] {
	const start = (Math.max(1, page) - 1) * Math.max(1, pageSize);
	return rows.slice(start, start + Math.max(1, pageSize));
}
