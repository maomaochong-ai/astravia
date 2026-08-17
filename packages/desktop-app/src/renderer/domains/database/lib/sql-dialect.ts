/**
 * SQL 方言纯函数（B2.6 经典工具界面）。
 * 标识符引号与「打开表」浏览 SQL 生成；不依赖 UI / IPC，便于单测。
 */

export type SqlIdentifierQuote = "double" | "backtick" | "bracket";

const BACKTICK_TYPES = new Set(["mysql", "doris", "starrocks"]);
const BRACKET_TYPES = new Set(["sqlserver", "access"]);
const FETCH_FIRST_TYPES = new Set(["oracle", "oceanbase-oracle"]);
const TOP_TYPES = new Set(["sqlserver", "access"]);

/** 按数据库类型返回标识符引号风格；未知类型保守用双引号。 */
export function identifierQuoteStyle(dbType: string): SqlIdentifierQuote {
	if (BACKTICK_TYPES.has(dbType)) return "backtick";
	if (BRACKET_TYPES.has(dbType)) return "bracket";
	return "double";
}

/** 按方言转义并包裹标识符（引号自身按各方言规则 doubling）。 */
export function quoteIdentifier(dbType: string, name: string): string {
	switch (identifierQuoteStyle(dbType)) {
		case "backtick":
			return `\`${name.replace(/`/g, "``")}\``;
		case "bracket":
			return `[${name.replace(/]/g, "]]")}]`;
		default:
			return `"${name.replace(/"/g, '""')}"`;
	}
}

/** 生成「打开表」浏览 SQL（只读 SELECT，带行数上限；方言适配 LIMIT / TOP / FETCH FIRST）。 */
export function buildOpenTableSql(dbType: string, table: string, limit = 100): string {
	const quoted = quoteIdentifier(dbType, table);
	if (TOP_TYPES.has(dbType)) return `SELECT TOP ${limit} * FROM ${quoted}`;
	if (FETCH_FIRST_TYPES.has(dbType)) return `SELECT * FROM ${quoted} FETCH FIRST ${limit} ROWS ONLY`;
	return `SELECT * FROM ${quoted} LIMIT ${limit}`;
}
