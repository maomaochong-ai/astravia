/**
 * SQL 可编辑性分析（B3.2-R 对齐 dbx-main `sql_editability.rs` 的纯 TS 子集）。
 *
 * 判定一条查询的结果是否可安全回写原表：仅接受「简单单表 SELECT」；
 * 拒绝 WITH/CTE、集合运算、聚合 / DISTINCT、多表 JOIN、多语句、非 SELECT。
 * 纯函数，不依赖 UI / IPC，便于单测。
 */

/** 不可编辑原因枚举（对齐 dbx `grid.queryEditUnsupported.<reason>` 语义）。 */
export type QueryEditabilityReason =
	| "not-select"
	| "cte"
	| "set-operation"
	| "aggregation"
	| "complex-source"
	| "no-table"
	| "computed-columns"
	| "external-source";

/** 可编辑查询的来源信息（供行定位 / 表结构读取）。 */
export interface EditableQueryInfo {
	/** 来源表名（未加引号）。 */
	table: string;
	/** SELECT *（true）或显式列投影（false）。 */
	selectStar: boolean;
	/** 显式投影的裸列名（去表前缀 / 去引号）；selectStar 时为空数组。 */
	columns: string[];
}

export type EditableQueryAnalysis =
	| { editable: false; reason: QueryEditabilityReason }
	| { editable: true; info: EditableQueryInfo };

/** 剥离 SQL 注释（`--` 行注释与块注释），等效 main 侧 stripSqlComments。 */
export function stripSqlComments(sql: string): string {
	let out = "";
	let i = 0;
	while (i < sql.length) {
		const ch = sql[i];
		if (ch === "-" && sql[i + 1] === "-") {
			const end = sql.indexOf("\n", i);
			i = end < 0 ? sql.length : end + 1;
			continue;
		}
		if (ch === "/" && sql[i + 1] === "*") {
			const end = sql.indexOf("*/", i + 2);
			i = end < 0 ? sql.length : end + 2;
			continue;
		}
		out += ch;
		i++;
	}
	return out;
}

/** 顶层关键字查找：跳过引号 / 括号 / 字符串字面量，仅匹配词边界后的关键字。 */
function findTopLevelKeyword(sql: string, keyword: string, start: number): number {
	let depth = 0;
	let quote: string | null = null;
	for (let i = start; i < sql.length; i++) {
		const ch = sql[i];
		if (quote) {
			if (ch === quote) quote = null;
			continue;
		}
		if (ch === "'" || ch === '"' || ch === "`") {
			quote = ch;
			continue;
		}
		if (ch === "(") {
			depth++;
			continue;
		}
		if (ch === ")") {
			depth--;
			continue;
		}
		if (
			depth === 0 &&
			i > start &&
			/\s/.test(sql[i - 1]) &&
			sql.slice(i, i + keyword.length).toUpperCase() === keyword
		) {
			const after = sql[i + keyword.length] ?? "";
			if (!/[A-Za-z0-9_$]/.test(after)) return i;
		}
	}
	return -1;
}

function hasTopLevelKeyword(sql: string, keywords: string[]): boolean {
	for (const keyword of keywords) {
		const index = findTopLevelKeyword(sql, keyword, 0);
		if (index >= 0) return true;
	}
	return false;
}

/** 从 FROM 体解析单个表源；多表 / JOIN / 子查询 / 表达式源返回 null。 */
function parseSingleSource(fromBody: string): { table: string } | null {
	if (fromBody.includes(",")) return null;
	if (/^\(/.test(fromBody)) return null;
	// 顶层 JOIN（含 LEFT/RIGHT/INNER/CROSS/FULL/OUTER 前缀）
	if (findTopLevelKeyword(fromBody, "JOIN", 0) >= 0) return null;
	// 去掉 AS alias / 裸 alias（非关键字、非引号开头）
	const match = fromBody.match(/^(.+?)(?:\s+(?:AS\s+)?[A-Za-z_][A-Za-z0-9_$]*)?$/i);
	const raw = match?.[1]?.trim() ?? fromBody;
	if (!raw) return null;
	// 取末段作为表名（允许 schema.table / "schema"."table" / `db`.`table`）
	const parts = raw.split(".");
	let table = parts[parts.length - 1] ?? "";
	table = table.replace(/^["`[]|["`\]]$/g, "").trim();
	if (!table || /[()\s]/.test(table)) return null;
	return { table };
}

/** 解析 SELECT 投影为裸列名列表；含函数 / 表达式 / 通配符（非 SELECT *）返回 null。 */
function parseProjectedColumns(selectBody: string): string[] | null {
	const columns: string[] = [];
	let depth = 0;
	let quote: string | null = null;
	let current = "";
	for (let i = 0; i < selectBody.length; i++) {
		const ch = selectBody[i];
		if (quote) {
			current += ch;
			if (ch === quote) quote = null;
			continue;
		}
		if (ch === "'" || ch === '"' || ch === "`" || ch === "[") {
			quote = ch === "[" ? "]" : ch;
			current += ch;
			continue;
		}
		if (ch === "(") {
			depth++;
			current += ch;
			continue;
		}
		if (ch === ")") {
			depth--;
			current += ch;
			continue;
		}
		if (ch === "," && depth === 0) {
			const column = parseProjectedColumn(current.trim());
			if (!column) return null;
			columns.push(column);
			current = "";
			continue;
		}
		current += ch;
	}
	if (current.trim()) {
		const column = parseProjectedColumn(current.trim());
		if (!column) return null;
		columns.push(column);
	}
	return columns.length > 0 ? columns : null;
}

/** 单列投影 → 裸列名；表达式 / 函数 / 通配符 / 别名返回 null。 */
function parseProjectedColumn(raw: string): string | null {
	if (!raw) return null;
	if (raw.includes("*")) return null;
	// 去掉 AS alias
	const withoutAlias = raw.replace(/\s+AS\s+[A-Za-z_][A-Za-z0-9_$]*$/i, "").trim();
	// 去表前缀（t.col / "t"."col"）
	const parts = withoutAlias.split(".");
	let column = parts[parts.length - 1] ?? "";
	column = column
		.trim()
		.replace(/^["`[]|["`\]]$/g, "")
		.trim();
	if (!column || /[^\w$]/.test(column) || /^\d/.test(column)) return null;
	return column;
}

/**
 * 分析查询结果可编辑性。
 *
 * 判定流程（等效 dbx）：
 * 1. 剥离注释、去尾分号；
 * 2. 拒绝：空 / WITH / 非 SELECT / 集合运算 / 多语句 / GROUP·HAVING / DISTINCT；
 * 3. 无顶层 FROM → no-table；FROM 体非单表 → complex-source（含 JOIN/子查询/外部源）；
 * 4. 投影含表达式 / 函数 / 通配符 → computed-columns；否则返回单表来源。
 */
export function analyzeEditableQuery(sql: string): EditableQueryAnalysis {
	const normalized = stripSqlComments(sql)
		.replace(/;+\s*$/, "")
		.trim();
	if (!normalized) return { editable: false, reason: "not-select" };
	if (/^\s*WITH\b/i.test(normalized)) return { editable: false, reason: "cte" };
	if (!/^SELECT\b/i.test(normalized)) return { editable: false, reason: "not-select" };
	if (hasTopLevelKeyword(normalized, ["UNION", "INTERSECT", "EXCEPT"]))
		return { editable: false, reason: "set-operation" };
	if (normalized.includes(";")) return { editable: false, reason: "complex-source" };
	if (hasTopLevelKeyword(normalized, ["GROUP", "HAVING"])) return { editable: false, reason: "aggregation" };
	if (/^SELECT\s+DISTINCT\b/i.test(normalized)) return { editable: false, reason: "aggregation" };

	const fromIndex = findTopLevelKeyword(normalized, "FROM", 0);
	if (fromIndex < 0) return { editable: false, reason: "no-table" };

	const selectBody = normalized.slice("SELECT".length, fromIndex).trim();
	const fromEnd = findTopLevelKeyword(normalized, "WHERE", fromIndex + 4);
	const orderIndex = findTopLevelKeyword(normalized, "ORDER", fromIndex + 4);
	const limitIndex = findTopLevelKeyword(normalized, "LIMIT", fromIndex + 4);
	const offsetIndex = findTopLevelKeyword(normalized, "OFFSET", fromIndex + 4);
	const fetchIndex = findTopLevelKeyword(normalized, "FETCH", fromIndex + 4);
	const ends = [fromEnd, orderIndex, limitIndex, offsetIndex, fetchIndex].filter((index) => index >= 0);
	const fromBody = normalized.slice(fromIndex + 4, ends.length > 0 ? Math.min(...ends) : normalized.length).trim();

	const source = parseSingleSource(fromBody);
	if (!source) return { editable: false, reason: "complex-source" };

	const selectStar = selectBody === "*";
	const columns = selectStar ? [] : parseProjectedColumns(selectBody);
	if (!selectStar && !columns) return { editable: false, reason: "computed-columns" };

	return { editable: true, info: { table: source.table, selectStar, columns: columns ?? [] } };
}
