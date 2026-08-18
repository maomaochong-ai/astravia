import type { DbQueryResult } from "../../../../preload/api-types/database";

/**
 * 查询结果摘要纯函数（B2.9 反向「让 AI 解读此查询」）。
 *
 * 结果网格工具栏「让 AI 解读此查询」会把当前 SQL 连同结果摘要一起注入 AI 会话，
 * 摘要必须紧凑且真实：列名 + 引擎报告总行数 + 前 N 行示例数据（单元格截断、
 * Markdown 表格转义），并显式声明示例截断，避免 AI 把样本当全量数据。
 */

export interface QueryResultSummaryOptions {
	/** 最多输出多少行示例数据（默认 20）。 */
	maxRows?: number;
	/** 单元格最多保留多少字符（默认 120），超长截断加 …。 */
	maxCellChars?: number;
}

const DEFAULT_MAX_ROWS = 20;
const DEFAULT_MAX_CELL_CHARS = 120;

/** Markdown 表格单元格转义：管道符转义、换行折叠为空格。 */
function escapeCell(value: string): string {
	return value.replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
}

/** 单元格截断：超长截断加 …。 */
function clipCell(value: string, max: number): string {
	return value.length <= max ? value : `${value.slice(0, max)}…`;
}

/**
 * 生成查询结果的紧凑 Markdown 摘要。
 *
 * 输出结构：行数/耗时说明行 + Markdown 表格（列头 + 分隔线 + 前 N 行示例）。
 * 示例行数少于实际行数时追加「仅显示前 N 行」提示。
 */
export function summarizeQueryResult(result: DbQueryResult, options: QueryResultSummaryOptions = {}): string {
	const maxRows = options.maxRows ?? DEFAULT_MAX_ROWS;
	const maxCellChars = options.maxCellChars ?? DEFAULT_MAX_CELL_CHARS;

	const header = `共 ${result.rowCount} 行${result.durationMs ? `，耗时 ${result.durationMs}` : ""}。`;

	const columns = result.columns;
	if (columns.length === 0 || result.rows.length === 0) {
		return `查询结果摘要：${header}`;
	}

	const lines: string[] = [];
	lines.push(`| ${columns.map(escapeCell).join(" | ")} |`);
	lines.push(`|${columns.map(() => " --- ").join("|")}|`);

	const sample = result.rows.slice(0, maxRows);
	for (const row of sample) {
		lines.push(`| ${columns.map((column) => escapeCell(clipCell(row[column] ?? "", maxCellChars))).join(" | ")} |`);
	}

	if (result.rows.length > maxRows) {
		lines.push("");
		lines.push(`（仅显示前 ${maxRows} 行示例，共 ${result.rowCount} 行）`);
	}

	return `查询结果摘要：${header}\n${lines.join("\n")}`;
}
