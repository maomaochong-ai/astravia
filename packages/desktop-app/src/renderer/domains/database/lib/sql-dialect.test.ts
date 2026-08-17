import { describe, expect, it } from "vitest";
import { buildOpenTableSql, identifierQuoteStyle, quoteIdentifier } from "./sql-dialect.js";

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
});
