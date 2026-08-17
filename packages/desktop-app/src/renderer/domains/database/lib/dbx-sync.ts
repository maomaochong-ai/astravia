import type { DbQueryResult } from "../../../../preload/api-types/database";

/**
 * B2.9-W1 查询同步通道（对话 → 工作台）的领域契约。
 *
 * dbx MCP 工具名 / 参数 / Markdown 结果是数据库域的领域知识；
 * chat 域（useSessionManager 的会话事件回调）只依赖本模块的常量与纯函数，
 * 不直接接触 dbx 工具细节。
 */
export const DBX_EXECUTE_QUERY_TOOL = "dbx_execute_query";

export interface DbxExecuteQueryArgs {
	readonly connectionName: string;
	readonly sql: string;
}

/** 从 dbx_execute_query 的 args 提取连接名与 SQL；不匹配返回 null。 */
export function parseDbxExecuteQueryArgs(args: unknown): DbxExecuteQueryArgs | null {
	if (args === null || typeof args !== "object") return null;
	const record = args as Record<string, unknown>;
	const connectionName = typeof record.connection_name === "string" ? record.connection_name.trim() : "";
	const sql = typeof record.sql === "string" ? record.sql.trim() : "";
	if (!connectionName || !sql) return null;
	return { connectionName, sql };
}

/** 提取 dbx 工具返回的文本内容（MCP content 数组 → 拼接文本）。 */
export function extractDbxResultText(result: unknown): string {
	if (typeof result === "string") return result.trim();
	if (result === null || typeof result !== "object") return "";
	const record = result as { content?: Array<{ text?: string }> };
	if (!Array.isArray(record.content)) return "";
	return record.content
		.map((part) => part.text ?? "")
		.join("\n")
		.trim();
}

/**
 * 解析 dbx 返回的 Markdown 表格文本 → 结构化结果（与 main database-service 同构）。
 * 无表格时返回 null（调用方忽略，不阻塞其它逻辑）。
 */
export function parseDbxQueryResultText(text: string): DbQueryResult | null {
	const lines = text
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.startsWith("|"));
	if (lines.length < 2) return null;

	const split = (line: string) =>
		line
			.replace(/^\|/, "")
			.replace(/\|$/, "")
			.split("|")
			.map((cell) => cell.trim());

	const columns = split(lines[0]);
	// 第二行是分隔线（| --- | --- |），跳过。
	const rows = lines.slice(2).map((line) => {
		const cells = split(line);
		const row: Record<string, string> = {};
		columns.forEach((column, index) => {
			row[column] = cells[index] ?? "";
		});
		return row;
	});
	const durationMatch = text.match(/(\d+)\s*(ms|s)\b/i);
	return {
		columns,
		rows,
		rowCount: rows.length,
		durationMs: durationMatch?.[0] ?? "",
		rawText: text,
	};
}
