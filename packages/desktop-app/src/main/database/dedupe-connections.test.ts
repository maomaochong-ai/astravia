import { describe, expect, it, vi } from "vitest";
import type { DbConnection } from "../../preload/api-types/database.js";
import { dedupeConnections } from "./database-service.js";

/**
 * 连接列表去重（纯函数）单测：pgsql 等连接在设置页列表与工作台连接树
 * 重复显示的回归用例。不触发引擎调用，故只 mock 掉 import 期依赖。
 */

vi.mock("../mcp/dbx-mcp-path.js", () => ({ resolveDbxMcpBinaryPath: () => "dbx-mcp.exe" }));
vi.mock("electron", () => ({ app: { isPackaged: false } }));

function make(id: string, name: string, host = "localhost"): DbConnection {
	return { id, name, groupPath: "", type: "postgres", host, port: 5432, database: "postgres", env: "dev" };
}

describe("dedupeConnections（连接列表重复行）", () => {
	it("同 id 重复行只保留首次出现（重复连接信息回归用例）", () => {
		const unique = dedupeConnections([make("id-1", "pg-dev"), make("id-1", "pg-dev"), make("id-2", "pg-prod")]);
		expect(unique.map((c) => c.name)).toEqual(["pg-dev", "pg-prod"]);
	});

	it("同名但 id 不同也判重（引擎存储残留）", () => {
		const unique = dedupeConnections([
			make("id-1", "pg-dev", "db.example.com"),
			make("id-2", "pg-dev", "db2.example.com"),
		]);
		expect(unique).toHaveLength(1);
		// 首次出现胜出，保留引擎原始顺序
		expect(unique[0].host).toBe("db.example.com");
	});

	it("id 为空时只按 name 去重（多条空 id 不互相判重）", () => {
		const unique = dedupeConnections([make("", "a"), make("", "b"), make("", "a")]);
		expect(unique.map((c) => c.name)).toEqual(["a", "b"]);
	});

	it("id 与 name 皆空的异常行原样保留（不静默吞掉引擎异常输出）", () => {
		expect(dedupeConnections([make("", ""), make("", "")])).toHaveLength(2);
	});

	it("名称仅首尾空白不同视为同一连接", () => {
		expect(dedupeConnections([make("", "pg-dev"), make("", " pg-dev ")])).toHaveLength(1);
	});

	it("无重复时保持原顺序不变", () => {
		const rows = [make("id-1", "a"), make("id-2", "b"), make("id-3", "c")];
		expect(dedupeConnections(rows)).toEqual(rows);
	});
});
