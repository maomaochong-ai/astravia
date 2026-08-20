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

/**
 * SQL 字面量转义（B3.2 数据编辑）：null/undefined → NULL；纯数字/布尔原样；
 * 其余按字符串处理（单引号翻倍）。NULL 在结果网格中即空串，按 NULL 导出。
 */
export function quoteLiteral(value: string | null | undefined): string {
	if (value === null || value === undefined) return "NULL";
	const trimmed = value.trim();
	if (/^-?\d+(\.\d+)?$/.test(trimmed)) return trimmed;
	if (/^(true|false)$/i.test(trimmed)) return trimmed.toUpperCase();
	return `'${value.replace(/'/g, "''")}'`;
}

/** 赋值/条件项：列名 + 字面量值（null 表示 SQL NULL）。 */
export interface SqlAssignment {
	column: string;
	value: string | null | undefined;
}

/** 等值条件片段（主键定位 / 整行定位用）。NULL 按 `IS NULL` 处理（`= NULL` 恒不匹配）。 */
function whereClause(dbType: string, conditions: readonly SqlAssignment[]): string {
	return conditions
		.map((c) => `${quoteIdentifier(dbType, c.column)} ${c.value == null ? "IS NULL" : `= ${quoteLiteral(c.value)}`}`)
		.join(" AND ");
}

/** 生成 UPDATE 语句（B3.2 单元格编辑）：SET 目标列 = 新值，WHERE 按主键等值定位。 */
export function buildUpdateSql(
	dbType: string,
	table: string,
	assignments: readonly SqlAssignment[],
	where: readonly SqlAssignment[],
): string {
	const set = assignments.map((a) => `${quoteIdentifier(dbType, a.column)} = ${quoteLiteral(a.value)}`).join(", ");
	return `UPDATE ${quoteIdentifier(dbType, table)} SET ${set} WHERE ${whereClause(dbType, where)}`;
}

/** 生成 INSERT 语句（B3.2 新增行）：列名 + 值按声明顺序对齐。 */
export function buildInsertSql(dbType: string, table: string, values: readonly SqlAssignment[]): string {
	const columns = values.map((v) => quoteIdentifier(dbType, v.column)).join(", ");
	const literals = values.map((v) => quoteLiteral(v.value)).join(", ");
	return `INSERT INTO ${quoteIdentifier(dbType, table)} (${columns}) VALUES (${literals})`;
}

/**
 * 行定位条件（B3.2 数据编辑）：主键列可用时优先用主键精确匹配；
 * 无主键（或主键值不在结果行中）时退化为整行等值匹配 —— 存在完全相同的数据行时会一次影响多行，
 * 调用方应在确认弹窗中提示。结果网格中 NULL 以空串表示，这里映射回 SQL NULL（IS NULL）。
 */
export function buildRowWhere(
	row: Record<string, string>,
	pkColumns: readonly string[],
	allColumns: readonly string[],
): SqlAssignment[] {
	const prefer = pkColumns.filter((column) => column in row);
	const columns = prefer.length > 0 ? prefer : allColumns.filter((column) => column in row);
	return columns.map((column) => ({ column, value: row[column] === "" ? null : row[column] }));
}

/** 生成 DELETE 语句（B3.2 删除行）：WHERE 按主键等值定位。 */
export function buildDeleteSql(dbType: string, table: string, where: readonly SqlAssignment[]): string {
	return `DELETE FROM ${quoteIdentifier(dbType, table)} WHERE ${whereClause(dbType, where)}`;
}
