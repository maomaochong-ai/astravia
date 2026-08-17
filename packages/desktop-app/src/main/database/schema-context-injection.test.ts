import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	buildDatabaseSchemaPrompt,
	clearSchemaContextCache,
	renderSchemaContextBlock,
	SCHEMA_CONTEXT_CHAR_LIMIT_PER_CONNECTION,
	type SchemaContextIo,
	summarizeSchema,
} from "./schema-context-injection.js";

function makeIo(overrides: Partial<SchemaContextIo> = {}): SchemaContextIo & {
	listConnections: ReturnType<typeof vi.fn>;
	getSchemaContext: ReturnType<typeof vi.fn>;
} {
	return {
		listConnections: vi.fn(async () => [{ name: "astravia-test" }]),
		getSchemaContext: vi.fn(async () => "users (id INTEGER PK, name TEXT)\ndepartments (id INTEGER PK, name TEXT)"),
		...overrides,
	} as never;
}

describe("summarizeSchema", () => {
	it("短文本原样返回", () => {
		expect(summarizeSchema("users (id INTEGER)")).toBe("users (id INTEGER)");
	});

	it("超限文本截断并保留截断提示", () => {
		const long = "x".repeat(SCHEMA_CONTEXT_CHAR_LIMIT_PER_CONNECTION + 500);
		const result = summarizeSchema(long);
		expect(result.length).toBeLessThan(long.length);
		expect(result.startsWith("x".repeat(SCHEMA_CONTEXT_CHAR_LIMIT_PER_CONNECTION))).toBe(true);
		expect(result).toContain("已截断");
	});
});

describe("renderSchemaContextBlock", () => {
	it("空条目返回空串", () => {
		expect(renderSchemaContextBlock([])).toBe("");
	});

	it("组装多连接块并包含连接名", () => {
		const block = renderSchemaContextBlock([
			{ connectionName: "a", schema: "t1 (id INTEGER)" },
			{ connectionName: "b", schema: "t2 (name TEXT)" },
		]);
		expect(block).toContain("连接「a」");
		expect(block).toContain("连接「b」");
		expect(block).toContain("dbx_execute_query");
		expect(block).toContain("connection_name");
	});

	it("executeToolAvailable=false 时不指示调用 dbx 工具（B2.10-W3）", () => {
		const block = renderSchemaContextBlock([{ connectionName: "a", schema: "t1 (id INTEGER)" }], {
			executeToolAvailable: false,
		});
		expect(block).toContain("连接「a」");
		expect(block).toContain("AI 访问");
		expect(block).not.toContain("dbx_execute_query");
		expect(block).not.toContain("connection_name");
	});
});

describe("buildDatabaseSchemaPrompt", () => {
	beforeEach(() => {
		clearSchemaContextCache();
	});

	it("无连接时返回 undefined", async () => {
		const io = makeIo({ listConnections: vi.fn(async () => []) });
		await expect(buildDatabaseSchemaPrompt(io)).resolves.toBeUndefined();
		expect(io.getSchemaContext).not.toHaveBeenCalled();
	});

	it("注入成功连接 schema", async () => {
		const io = makeIo();
		const prompt = await buildDatabaseSchemaPrompt(io);
		expect(prompt).toBeDefined();
		expect(prompt).toContain("连接「astravia-test」");
		expect(prompt).toContain("users");
		expect(io.getSchemaContext).toHaveBeenCalledWith("astravia-test");
	});

	it("单连接失败时静默跳过，其余连接正常注入", async () => {
		const io = makeIo({
			listConnections: vi.fn(async () => [{ name: "ok-conn" }, { name: "bad-conn" }]),
			getSchemaContext: vi.fn(async (name: string) => {
				if (name === "bad-conn") throw new Error("DBX_NOT_RUNNING");
				return "ok (id INTEGER)";
			}),
		});
		const prompt = await buildDatabaseSchemaPrompt(io);
		expect(prompt).toContain("连接「ok-conn」");
		expect(prompt).not.toContain("bad-conn");
	});

	it("全部失败时返回 undefined 且不抛错", async () => {
		const io = makeIo({
			getSchemaContext: vi.fn(async () => {
				throw new Error("connection failed");
			}),
		});
		await expect(buildDatabaseSchemaPrompt(io)).resolves.toBeUndefined();
	});

	it("listConnections 失败时返回 undefined 且不抛错", async () => {
		const io = makeIo({
			listConnections: vi.fn(async () => {
				throw new Error("engine not running");
			}),
		});
		await expect(buildDatabaseSchemaPrompt(io)).resolves.toBeUndefined();
	});

	it("TTL 内重复调用命中缓存，不重复打 io", async () => {
		const io = makeIo();
		await buildDatabaseSchemaPrompt(io);
		await buildDatabaseSchemaPrompt(io);
		expect(io.getSchemaContext).toHaveBeenCalledTimes(1);
	});

	it("清理缓存后重新获取", async () => {
		const io = makeIo();
		await buildDatabaseSchemaPrompt(io);
		clearSchemaContextCache();
		await buildDatabaseSchemaPrompt(io);
		expect(io.getSchemaContext).toHaveBeenCalledTimes(2);
	});

	it("空 schema 文本的连接被跳过", async () => {
		const io = makeIo({
			getSchemaContext: vi.fn(async () => "   "),
		});
		await expect(buildDatabaseSchemaPrompt(io)).resolves.toBeUndefined();
	});
});
