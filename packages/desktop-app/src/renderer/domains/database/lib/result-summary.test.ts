import { describe, expect, it } from "vitest";
import type { DbQueryResult } from "../../../../preload/api-types/database";
import { summarizeQueryResult } from "./result-summary.js";

function makeResult(partial: Partial<DbQueryResult>): DbQueryResult {
	return {
		columns: ["id", "name"],
		rows: [
			{ id: "1", name: "Alice" },
			{ id: "2", name: "Bob" },
		],
		rowCount: 2,
		durationMs: "3ms",
		rawText: "",
		...partial,
	};
}

describe("summarizeQueryResult", () => {
	it("输出行数说明 + 列头 + 分隔线 + 数据行", () => {
		const text = summarizeQueryResult(makeResult({}));
		expect(text).toContain("共 2 行，耗时 3ms");
		expect(text).toContain("| id | name |");
		expect(text).toContain("| --- | --- |");
		expect(text).toContain("| 1 | Alice |");
		expect(text).toContain("| 2 | Bob |");
	});

	it("无耗时字段时不输出耗时", () => {
		const text = summarizeQueryResult(makeResult({ durationMs: "" }));
		expect(text).toContain("共 2 行。");
		expect(text).not.toContain("耗时");
	});

	it("无列或空行时只输出行数说明", () => {
		const noResult = makeResult({ columns: [], rows: [], rowCount: 0, durationMs: "" });
		expect(summarizeQueryResult(noResult)).toBe("查询结果摘要：共 0 行。");
		expect(summarizeQueryResult(makeResult({ columns: ["id"], rows: [], rowCount: 0, durationMs: "" }))).toBe(
			"查询结果摘要：共 0 行。",
		);
	});

	it("示例行数超过 maxRows 时截断并提示", () => {
		const rows = Array.from({ length: 30 }, (_, i) => ({ id: String(i + 1), name: `u${i + 1}` }));
		const text = summarizeQueryResult(makeResult({ rows, rowCount: 30 }), { maxRows: 5 });
		expect(text).toContain("| 5 | u5 |");
		expect(text).not.toContain("| 6 | u6 |");
		expect(text).toContain("（仅显示前 5 行示例，共 30 行）");
	});

	it("单元格超长截断加 …", () => {
		const longValue = "x".repeat(200);
		const text = summarizeQueryResult(makeResult({ rows: [{ id: "1", name: longValue }] }), { maxCellChars: 10 });
		expect(text).toContain(`| 1 | ${"x".repeat(10)}… |`);
	});

	it("Markdown 表格特殊字符转义（管道符 / 换行）", () => {
		const text = summarizeQueryResult(makeResult({ rows: [{ id: "1", name: "a|b\nc" }] }));
		expect(text).toContain("| 1 | a\\|b c |");
	});
});
