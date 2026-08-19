import { describe, expect, it } from "vitest";
import type { DbConnection, DbTableInfo } from "../../../../preload/api-types/database.js";
import {
	connectionGroupOf,
	connectionMatchesQuery,
	filterConnections,
	filterTables,
	groupConnections,
	tableMatchesQuery,
} from "./database-tree.js";

const DEFAULT = "默认分组";

function conn(name: string, groupPath = ""): DbConnection {
	return { id: name, name, groupPath, type: "postgres", host: "h", port: 5432, database: "d", env: "dev" };
}

function table(name: string): DbTableInfo {
	return { name, kind: "BASE TABLE" };
}

describe("connectionGroupOf", () => {
	it("空 groupPath 归默认分组", () => {
		expect(connectionGroupOf(conn("a"), DEFAULT)).toBe(DEFAULT);
	});

	it("取路径首段（/ 与 \\ 都支持）", () => {
		expect(connectionGroupOf(conn("a", "生产/订单库"), DEFAULT)).toBe("生产");
		expect(connectionGroupOf(conn("b", "生产\\订单库"), DEFAULT)).toBe("生产");
		expect(connectionGroupOf(conn("c", "测试"), DEFAULT)).toBe("测试");
	});

	it("纯空白 groupPath 归默认", () => {
		expect(connectionGroupOf(conn("a", "   "), DEFAULT)).toBe(DEFAULT);
	});
});

describe("groupConnections", () => {
	it("保持连接原始顺序，组名排序（默认分组置顶）", () => {
		const a = conn("a", "生产");
		const b = conn("b");
		const c = conn("c", "测试");
		const groups = groupConnections([a, b, c], DEFAULT);
		expect(groups.map((g) => g.group)).toEqual([DEFAULT, "测试", "生产"]);
		expect(groups.find((g) => g.group === DEFAULT)?.connections).toEqual([b]);
		expect(groups.find((g) => g.group === "生产")?.connections).toEqual([a]);
	});

	it("空列表返回空数组", () => {
		expect(groupConnections([], DEFAULT)).toEqual([]);
	});

	it("同一组内保持传入顺序", () => {
		const a = conn("a", "生产");
		const b = conn("b", "生产");
		expect(groupConnections([a, b], DEFAULT)[0].connections).toEqual([a, b]);
	});
});

describe("搜索匹配", () => {
	it("连接名不区分大小写匹配", () => {
		expect(connectionMatchesQuery(conn("MyDB"), "mydb")).toBe(true);
		expect(connectionMatchesQuery(conn("MyDB"), "db")).toBe(true);
		expect(connectionMatchesQuery(conn("MyDB"), "nope")).toBe(false);
	});

	it("表名不区分大小写匹配", () => {
		expect(tableMatchesQuery(table("Users"), "users")).toBe(true);
		expect(tableMatchesQuery(table("Users"), "ser")).toBe(true);
		expect(tableMatchesQuery(table("Users"), "orders")).toBe(false);
	});

	it("filterTables 空查询返回全部（拷贝）", () => {
		const tables = [table("users"), table("orders")];
		const result = filterTables(tables, "  ");
		expect(result).toEqual(tables);
		expect(result).not.toBe(tables);
	});

	it("filterTables 只保留表名命中的表", () => {
		const tables = [table("users"), table("order_items"), table("products")];
		expect(filterTables(tables, "order").map((item) => item.name)).toEqual(["order_items"]);
		expect(filterTables(tables, "USERS").map((item) => item.name)).toEqual(["users"]);
		expect(filterTables(tables, "nope")).toEqual([]);
	});
});

describe("filterConnections", () => {
	const users = table("users");
	const orders = table("orders");
	const connections = [conn("生产库"), conn("测试库")];

	it("空查询返回全部且不强制展开", () => {
		const result = filterConnections(connections, "  ", () => []);
		expect(result.visible).toEqual(connections);
		expect(result.forceExpanded.size).toBe(0);
	});

	it("连接名命中则保留（无需表数据）", () => {
		const result = filterConnections(connections, "生产", () => []);
		expect(result.visible.map((c) => c.name)).toEqual(["生产库"]);
		expect(result.forceExpanded.size).toBe(0);
	});

	it("表名命中保留连接并强制展开", () => {
		const tableNamesOf = (c: DbConnection) => (c.name === "测试库" ? [users, orders] : [users]);
		const result = filterConnections(connections, "orders", tableNamesOf);
		expect(result.visible.map((c) => c.name)).toEqual(["测试库"]);
		expect(result.forceExpanded.has("测试库")).toBe(true);
	});

	it("无命中返回空", () => {
		const result = filterConnections(connections, "不存在", () => [users, orders]);
		expect(result.visible).toEqual([]);
		expect(result.forceExpanded.size).toBe(0);
	});
});
