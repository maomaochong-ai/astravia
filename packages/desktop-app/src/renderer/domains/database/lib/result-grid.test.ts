import { describe, expect, it } from "vitest";
import {
	clampPage,
	escapeCsvField,
	inferColumnKind,
	isNullCell,
	nextSortDirection,
	pageCount,
	pageSlice,
	type ResultColumnKind,
	rowsToCsv,
	rowsToJson,
	rowsToTsv,
	sortRows,
	truncateCell,
} from "./result-grid.js";

describe("inferColumnKind", () => {
	it("全空列 → empty", () => {
		expect(inferColumnKind(["", "", null, undefined])).toBe("empty");
	});
	it("全数字 → number（含负数/小数/科学计数）", () => {
		expect(inferColumnKind(["1", "-2.5", "3e4", ""])).toBe("number");
	});
	it("全布尔 → boolean", () => {
		expect(inferColumnKind(["true", "FALSE", "t"])).toBe("boolean");
	});
	it("混合 → text", () => {
		expect(inferColumnKind(["1", "abc"])).toBe("text");
	});
	it("数字串混空值仍 → number", () => {
		expect(inferColumnKind(["10", null, "20"])).toBe("number");
	});
});

describe("truncateCell", () => {
	it("短文本原样", () => {
		expect(truncateCell("abc")).toBe("abc");
	});
	it("超长截断带省略号", () => {
		const long = "x".repeat(250);
		const out = truncateCell(long);
		expect(out.length).toBe(201);
		expect(out.endsWith("…")).toBe(true);
	});
});

describe("isNullCell", () => {
	it("空串/空白/null 视为 NULL", () => {
		expect(isNullCell("")).toBe(true);
		expect(isNullCell("  ")).toBe(true);
		expect(isNullCell(null)).toBe(true);
		expect(isNullCell("0")).toBe(false);
	});
});

describe("nextSortDirection", () => {
	it("未排序 → 升序 → 降序 → 未排序 循环", () => {
		expect(nextSortDirection(null)).toBe("asc");
		expect(nextSortDirection("asc")).toBe("desc");
		expect(nextSortDirection("desc")).toBe(null);
	});
});

describe("sortRows", () => {
	const columns = ["id", "name"];
	const rows = [
		{ id: "2", name: "beta" },
		{ id: "10", name: "alpha" },
		{ id: "1", name: "gamma" },
	];
	const kinds: readonly ResultColumnKind[] = ["number", "text"];

	it("数字列数值排序（非字典序，10 > 2）", () => {
		expect(sortRows(rows, columns, "id", "asc", kinds).map((r) => r.id)).toEqual(["1", "2", "10"]);
	});
	it("文本列 localeCompare 排序", () => {
		expect(sortRows(rows, columns, "name", "asc", kinds).map((r) => r.name)).toEqual(["alpha", "beta", "gamma"]);
	});
	it("降序反转", () => {
		expect(sortRows(rows, columns, "id", "desc", kinds).map((r) => r.id)).toEqual(["10", "2", "1"]);
	});
	it("不修改原数组", () => {
		const before = rows.map((r) => r.id);
		sortRows(rows, columns, "id", "asc", kinds);
		expect(rows.map((r) => r.id)).toEqual(before);
	});
});

describe("escapeCsvField", () => {
	it("普通字段原样", () => {
		expect(escapeCsvField("abc")).toBe("abc");
	});
	it("含逗号/引号/换行加引号并转义", () => {
		expect(escapeCsvField("a,b")).toBe('"a,b"');
		expect(escapeCsvField('a"b')).toBe('"a""b"');
		expect(escapeCsvField("a\nb")).toBe('"a\nb"');
	});
});

describe("rowsToCsv", () => {
	it("首行列名 + CRLF + NULL 空串", () => {
		const out = rowsToCsv(
			["id", "name"],
			[
				{ id: "1", name: "a" },
				{ id: "2", name: "" },
			],
		);
		expect(out).toBe("id,name\r\n1,a\r\n2,");
	});
});

describe("rowsToJson", () => {
	it("数组对象 + NULL 为 null", () => {
		const out = rowsToJson(["id", "name"], [{ id: "1", name: "" }]);
		expect(JSON.parse(out)).toEqual([{ id: "1", name: null }]);
	});
});

describe("rowsToTsv", () => {
	it("制表符分隔 + NULL 空串", () => {
		const out = rowsToTsv(["id", "name"], [{ id: "1", name: "a" }]);
		expect(out).toBe("id\tname\n1\ta");
	});
});

describe("pageCount", () => {
	it("按页大小向上取整，空集按 1 页", () => {
		expect(pageCount(0, 100)).toBe(1);
		expect(pageCount(1, 100)).toBe(1);
		expect(pageCount(100, 100)).toBe(1);
		expect(pageCount(101, 100)).toBe(2);
		expect(pageCount(250, 100)).toBe(3);
	});
	it("非法页大小按 1 页", () => {
		expect(pageCount(10, 0)).toBe(1);
	});
});

describe("clampPage", () => {
	it("夹到 [1, totalPages]", () => {
		expect(clampPage(1, 250, 100)).toBe(1);
		expect(clampPage(2, 250, 100)).toBe(2);
		expect(clampPage(3, 250, 100)).toBe(3);
		expect(clampPage(99, 250, 100)).toBe(3);
		expect(clampPage(0, 250, 100)).toBe(1);
		expect(clampPage(1, 0, 100)).toBe(1);
	});
});

describe("pageSlice", () => {
	const rows = Array.from({ length: 250 }, (_, i) => i);
	it("按页大小切分，末页为余数", () => {
		expect(pageSlice(rows, 1, 100)).toHaveLength(100);
		expect(pageSlice(rows, 1, 100)[0]).toBe(0);
		expect(pageSlice(rows, 2, 100)[0]).toBe(100);
		expect(pageSlice(rows, 3, 100)).toHaveLength(50);
		expect(pageSlice(rows, 3, 100)[0]).toBe(200);
	});
	it("越界页码返回空切片（调用方先用 clampPage 归一）", () => {
		expect(pageSlice(rows, 99, 100)).toEqual([]);
	});
	it("空集返回空", () => {
		expect(pageSlice([], 1, 100)).toEqual([]);
	});
});
