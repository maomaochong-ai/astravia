import type { DatabaseError } from "../../preload/api-types/database.js";

/**
 * SQL 只读/写语句分类（W4-② 生产连接写保护）。
 *
 * 语义：保守 —— 无法明确判定为只读的语句一律视为写操作。
 * 实现：剥离 SQL 注释后按首关键字分类；WITH（CTE）开头无法直接判定主体，
 * 退化为全文扫描写关键字。SELECT 开头的语句不做全文扫描，
 * 避免列名 / 字符串字面量里的写关键字造成误报。
 */

/** 明确只读的语句首关键字。 */
const READ_LEADERS = new Set(["SELECT", "SHOW", "DESCRIBE", "DESC", "EXPLAIN", "PRAGMA", "USE"]);

/** 写操作关键字（WITH 开头语句的全文扫描用）。 */
const WRITE_KEYWORDS = [
	"INSERT",
	"UPDATE",
	"DELETE",
	"REPLACE",
	"MERGE",
	"UPSERT",
	"TRUNCATE",
	"CREATE",
	"ALTER",
	"DROP",
	"GRANT",
	"REVOKE",
	"COMMENT",
	"CALL",
	"EXEC",
	"EXECUTE",
	"DO",
	"VACUUM",
	"REINDEX",
	"COPY",
	"LOAD",
	"LOCK",
	"ATTACH",
	"DETACH",
	"RENAME",
	"ANALYZE",
	"SET",
];

const WRITE_KEYWORD_RE = new RegExp(`\\b(?:${WRITE_KEYWORDS.join("|")})\\b`);

/**
 * 去掉 SQL 注释（`--` 行注释与 `/* ... *​/` 块注释）。
 * 不处理字符串字面量：对首关键字判定无影响，WITH 全文扫描的极端误报
 * 方向是「保守拦截」（用户可显式授权），符合安全默认语义。
 */
export function stripSqlComments(sql: string): string {
	let out = "";
	let i = 0;
	let inLine = false;
	let inBlock = false;
	while (i < sql.length) {
		const ch = sql[i];
		const next = sql[i + 1];
		if (!inLine && !inBlock && ch === "-" && next === "-") {
			inLine = true;
			i += 2;
			continue;
		}
		if (!inLine && !inBlock && ch === "/" && next === "*") {
			inBlock = true;
			i += 2;
			continue;
		}
		if (inLine) {
			if (ch === "\n") inLine = false;
			else {
				i += 1;
				continue;
			}
		}
		if (inBlock) {
			if (ch === "*" && next === "/") {
				inBlock = false;
				i += 2;
				continue;
			}
			i += 1;
			continue;
		}
		out += ch;
		i += 1;
	}
	return out;
}

/** 提取语句第一个有效词（大写；无有效词返回空串）。 */
function firstKeyword(sql: string): string {
	const m = sql.trim().match(/^[a-zA-Z_][a-zA-Z0-9_]*/);
	return m ? m[0].toUpperCase() : "";
}

/** 是否为写语句（非只读）。空语句 / 纯注释视为非写。 */
export function isWriteStatement(sql: string): boolean {
	const cleaned = stripSqlComments(sql).trim();
	if (!cleaned) return false;
	const first = firstKeyword(cleaned);
	if (READ_LEADERS.has(first)) return false;
	if (first === "WITH") {
		// CTE 主体可能是写语句（WITH ... UPDATE / DELETE / INSERT），无法简单判定 → 全文扫描。
		return WRITE_KEYWORD_RE.test(cleaned.toUpperCase());
	}
	// 其余首关键字（含未知关键字）一律按写处理：默认禁止的保守语义。
	return true;
}

/** 生产写保护拦截判定（W4-②）：prod 且未显式授权时，写语句返回 PROD_WRITE_BLOCKED。 */
export function maybeBlockProdWrite(input: {
	env: "prod" | "dev";
	/** 该连接是否已显式授权生产写操作。 */
	writeApproved: boolean;
	sql: string;
}): DatabaseError | null {
	if (input.env !== "prod" || input.writeApproved) return null;
	if (!isWriteStatement(input.sql)) return null;
	return { code: "PROD_WRITE_BLOCKED", detail: "Write statement on production connection requires explicit approval" };
}
