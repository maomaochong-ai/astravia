import { describe, expect, it } from "vitest";
import { analyzeEditableQuery, stripSqlComments } from "./sql-editability.js";

describe("stripSqlComments", () => {
	it("剥离行注释与块注释", () => {
		expect(stripSqlComments("SELECT 1 -- 注释\nFROM t")).toBe("SELECT 1 FROM t");
		expect(stripSqlComments("SELECT /* 块 */ 1 FROM t")).toBe("SELECT  1 FROM t");
	});
});

describe("analyzeEditableQuery — 可编辑", () => {
	it("SELECT * 单表（打开表浏览 SQL）", () => {
		expect(analyzeEditableQuery('SELECT * FROM "users" LIMIT 100')).toEqual({
			editable: true,
			info: { table: "users", selectStar: true, columns: [] },
		});
	});
	it("显式列投影", () => {
		expect(analyzeEditableQuery("SELECT id, name FROM users")).toEqual({
			editable: true,
			info: { table: "users", selectStar: false, columns: ["id", "name"] },
		});
	});
	it("带 WHERE / ORDER BY / 表前缀列", () => {
		expect(analyzeEditableQuery("SELECT u.id, u.name FROM public.users AS u WHERE u.id > 10 ORDER BY u.id")).toEqual({
			editable: true,
			info: { table: "users", selectStar: false, columns: ["id", "name"] },
		});
	});
	it("schema 限定表名取末段", () => {
		expect(analyzeEditableQuery('SELECT * FROM "public"."orders"')).toEqual({
			editable: true,
			info: { table: "orders", selectStar: true, columns: [] },
		});
	});
	it("带注释与尾分号", () => {
		expect(analyzeEditableQuery("SELECT * FROM users; -- 查询")).toEqual({
			editable: true,
			info: { table: "users", selectStar: true, columns: [] },
		});
	});
});

describe("analyzeEditableQuery — 不可编辑", () => {
	it("非 SELECT → not-select", () => {
		expect(analyzeEditableQuery("UPDATE users SET name = 'x'")).toEqual({ editable: false, reason: "not-select" });
		expect(analyzeEditableQuery("")).toEqual({ editable: false, reason: "not-select" });
	});
	it("WITH/CTE → cte", () => {
		expect(analyzeEditableQuery("WITH c AS (SELECT * FROM users) SELECT * FROM c")).toEqual({
			editable: false,
			reason: "cte",
		});
	});
	it("集合运算 → set-operation", () => {
		expect(analyzeEditableQuery("SELECT * FROM a UNION SELECT * FROM b")).toEqual({
			editable: false,
			reason: "set-operation",
		});
		expect(analyzeEditableQuery("SELECT * FROM a EXCEPT SELECT * FROM b")).toEqual({
			editable: false,
			reason: "set-operation",
		});
	});
	it("多语句 → complex-source", () => {
		expect(analyzeEditableQuery("SELECT * FROM a; SELECT * FROM b")).toEqual({
			editable: false,
			reason: "complex-source",
		});
	});
	it("聚合 → aggregation", () => {
		expect(analyzeEditableQuery("SELECT dept, COUNT(*) FROM users GROUP BY dept")).toEqual({
			editable: false,
			reason: "aggregation",
		});
		expect(analyzeEditableQuery("SELECT DISTINCT name FROM users")).toEqual({
			editable: false,
			reason: "aggregation",
		});
	});
	it("无 FROM → no-table", () => {
		expect(analyzeEditableQuery("SELECT 1")).toEqual({ editable: false, reason: "no-table" });
	});
	it("多表 JOIN / 逗号 → complex-source", () => {
		expect(analyzeEditableQuery("SELECT * FROM a JOIN b ON a.id = b.id")).toEqual({
			editable: false,
			reason: "complex-source",
		});
		expect(analyzeEditableQuery("SELECT * FROM a, b")).toEqual({ editable: false, reason: "complex-source" });
	});
	it("表达式 / 函数投影 → computed-columns", () => {
		expect(analyzeEditableQuery("SELECT UPPER(name) FROM users")).toEqual({
			editable: false,
			reason: "computed-columns",
		});
		expect(analyzeEditableQuery("SELECT id + 1 FROM users")).toEqual({ editable: false, reason: "computed-columns" });
	});
	it("子查询源 → complex-source", () => {
		expect(analyzeEditableQuery("SELECT * FROM (SELECT * FROM users) t")).toEqual({
			editable: false,
			reason: "complex-source",
		});
	});
});
