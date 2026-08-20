import { describe, expect, it } from "vitest";
import {
	buildDeleteSql,
	buildInsertSql,
	buildOpenTableSql,
	buildUpdateSql,
	identifierQuoteStyle,
	quoteIdentifier,
	quoteLiteral,
} from "./sql-dialect.js";

describe("identifierQuoteStyle", () => {
	it("mysql 系用反引号", () => {
		for (const t of ["mysql", "doris", "starrocks"]) expect(identifierQuoteStyle(t)).toBe("backtick");
	});
	it("sqlserver / access 用方括号", () => {
		expect(identifierQuoteStyle("sqlserver")).toBe("bracket");
		expect(identifierQuoteStyle("access")).toBe("bracket");
	});
	it("其余类型保守双引号", () => {
		for (const t of ["postgres", "sqlite", "duckdb", "oracle", "clickhouse", "unknown"]) {
			expect(identifierQuoteStyle(t)).toBe("double");
		}
	});
});

describe("quoteIdentifier", () => {
	it("双引号风格转义内嵌引号", () => {
		expect(quoteIdentifier("postgres", 'weird"name')).toBe('"weird""name"');
	});
	it("反引号风格 doubling", () => {
		expect(quoteIdentifier("mysql", "a`b")).toBe("`a``b`");
	});
	it("方括号风格 ] doubling", () => {
		expect(quoteIdentifier("sqlserver", "a]b")).toBe("[a]]b]");
	});
});

describe("buildOpenTableSql", () => {
	it("默认 LIMIT 100", () => {
		expect(buildOpenTableSql("postgres", "users")).toBe('SELECT * FROM "users" LIMIT 100');
	});
	it("sqlite 表名含空格也能正确包裹", () => {
		expect(buildOpenTableSql("sqlite", "my table", 50)).toBe('SELECT * FROM "my table" LIMIT 50');
	});
	it("sqlserver 用 TOP", () => {
		expect(buildOpenTableSql("sqlserver", "users")).toBe("SELECT TOP 100 * FROM [users]");
	});
	it("oracle 用 FETCH FIRST", () => {
		expect(buildOpenTableSql("oracle", "users")).toBe('SELECT * FROM "users" FETCH FIRST 100 ROWS ONLY');
	});
	// V6-② 服务端分页：offset > 0 时按方言输出 OFFSET 语法。
	it("postgres 翻页用 LIMIT…OFFSET", () => {
		expect(buildOpenTableSql("postgres", "users", 100, 100)).toBe('SELECT * FROM "users" LIMIT 100 OFFSET 100');
	});
	it("mysql 翻页反引号 + LIMIT…OFFSET", () => {
		expect(buildOpenTableSql("mysql", "users", 100, 200)).toBe("SELECT * FROM `users` LIMIT 100 OFFSET 200");
	});
	it("sqlite 翻页 LIMIT…OFFSET", () => {
		expect(buildOpenTableSql("sqlite", "users", 50, 150)).toBe('SELECT * FROM "users" LIMIT 50 OFFSET 150');
	});
	it("sqlserver 翻页用 ORDER BY (SELECT NULL) OFFSET…FETCH NEXT", () => {
		expect(buildOpenTableSql("sqlserver", "users", 100, 100)).toBe(
			"SELECT * FROM [users] ORDER BY (SELECT NULL) OFFSET 100 ROWS FETCH NEXT 100 ROWS ONLY",
		);
	});
	it("oracle 翻页用 OFFSET…FETCH NEXT", () => {
		expect(buildOpenTableSql("oracle", "users", 100, 100)).toBe(
			'SELECT * FROM "users" OFFSET 100 ROWS FETCH NEXT 100 ROWS ONLY',
		);
	});
});

describe("quoteLiteral", () => {
	it("null/undefined 输出 NULL", () => {
		expect(quoteLiteral(null)).toBe("NULL");
		expect(quoteLiteral(undefined)).toBe("NULL");
	});
	it("纯数字/布尔原样输出", () => {
		expect(quoteLiteral("42")).toBe("42");
		expect(quoteLiteral("-1.5")).toBe("-1.5");
		expect(quoteLiteral("true")).toBe("TRUE");
	});
	it("字符串单引号包裹且翻倍转义", () => {
		expect(quoteLiteral("hello")).toBe("'hello'");
		expect(quoteLiteral("O'Reilly")).toBe("'O''Reilly'");
	});
});

describe("buildUpdateSql", () => {
	it("postgres 双引号 + 主键 WHERE", () => {
		expect(
			buildUpdateSql("postgres", "users", [{ column: "name", value: "bob" }], [{ column: "id", value: "7" }]),
		).toBe('UPDATE "users" SET "name" = \'bob\' WHERE "id" = 7');
	});
	it("多列赋值 + 复合主键 AND", () => {
		expect(
			buildUpdateSql(
				"mysql",
				"orders",
				[
					{ column: "status", value: "paid" },
					{ column: "note", value: null },
				],
				[
					{ column: "tenant", value: "3" },
					{ column: "id", value: "9" },
				],
			),
		).toBe("UPDATE `orders` SET `status` = 'paid', `note` = NULL WHERE `tenant` = 3 AND `id` = 9");
	});
});

describe("buildInsertSql", () => {
	it("按声明顺序生成列名与值", () => {
		expect(
			buildInsertSql("postgres", "users", [
				{ column: "name", value: "alice" },
				{ column: "age", value: "30" },
			]),
		).toBe('INSERT INTO "users" ("name", "age") VALUES (\'alice\', 30)');
	});
	it("sqlserver 方括号标识符", () => {
		expect(buildInsertSql("sqlserver", "users", [{ column: "name", value: "bob" }])).toBe(
			"INSERT INTO [users] ([name]) VALUES ('bob')",
		);
	});
});

describe("buildDeleteSql", () => {
	it("主键定位删除", () => {
		expect(buildDeleteSql("postgres", "users", [{ column: "id", value: "5" }])).toBe(
			'DELETE FROM "users" WHERE "id" = 5',
		);
	});
	it("复合主键 AND 连接", () => {
		expect(
			buildDeleteSql("mysql", "orders", [
				{ column: "tenant", value: "1" },
				{ column: "id", value: "2" },
			]),
		).toBe("DELETE FROM `orders` WHERE `tenant` = 1 AND `id` = 2");
	});
});
