import { describe, expect, it } from "vitest";
import {
	DBX_EXECUTE_QUERY_TOOL,
	extractDbxResultText,
	parseDbxExecuteQueryArgs,
	parseDbxQueryResultText,
} from "./dbx-sync.js";

describe("DBX_EXECUTE_QUERY_TOOL", () => {
	it("工具名与 dbx 引擎一致", () => {
		expect(DBX_EXECUTE_QUERY_TOOL).toBe("dbx_execute_query");
	});
});

describe("parseDbxExecuteQueryArgs", () => {
	it("提取 connection_name 与 sql", () => {
		expect(parseDbxExecuteQueryArgs({ connection_name: "  prod ", sql: " SELECT 1 " })).toEqual({
			connectionName: "prod",
			sql: "SELECT 1",
		});
	});

	it("非对象 / 缺字段 / 空值 → null", () => {
		expect(parseDbxExecuteQueryArgs(null)).toBeNull();
		expect(parseDbxExecuteQueryArgs("sql")).toBeNull();
		expect(parseDbxExecuteQueryArgs({ connection_name: "prod" })).toBeNull();
		expect(parseDbxExecuteQueryArgs({ connection_name: "", sql: "SELECT 1" })).toBeNull();
		expect(parseDbxExecuteQueryArgs({ connection_name: "prod", sql: "  " })).toBeNull();
	});
});

describe("extractDbxResultText", () => {
	it("MCP content 数组 → 拼接文本", () => {
		expect(extractDbxResultText({ content: [{ text: "| a | b |" }, { text: "| 1 | 2 |" }] })).toBe(
			"| a | b |\n| 1 | 2 |",
		);
	});

	it("纯字符串直接返回", () => {
		expect(extractDbxResultText("| a |")).toBe("| a |");
	});

	it("非文本形态 → 空串", () => {
		expect(extractDbxResultText(null)).toBe("");
		expect(extractDbxResultText({ content: [] })).toBe("");
		expect(extractDbxResultText(42)).toBe("");
	});
});

describe("parseDbxQueryResultText", () => {
	const markdown = ["| id | name |", "| --- | --- |", "| 1 | Alice |", "| 2 | Bob |"].join("\n");

	it("解析列名与行", () => {
		expect(parseDbxQueryResultText(markdown)).toEqual({
			columns: ["id", "name"],
			rows: [
				{ id: "1", name: "Alice" },
				{ id: "2", name: "Bob" },
			],
			rowCount: 2,
			durationMs: "",
			rawText: markdown,
		});
	});

	it("提取耗时", () => {
		const result = parseDbxQueryResultText(`${markdown}\n\n12ms`);
		expect(result?.durationMs).toBe("12ms");
	});

	it("无表格 → null", () => {
		expect(parseDbxQueryResultText("connection ok")).toBeNull();
		expect(parseDbxQueryResultText("")).toBeNull();
	});
});
