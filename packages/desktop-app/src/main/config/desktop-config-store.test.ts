import { describe, expect, it } from "vitest";
import {
	normalizeConnectionEnv,
	normalizeDatabase,
	normalizeProdWriteApproved,
	normalizeSchemaInjectionScope,
	type SchemaInjectionScopeConfig,
} from "./desktop-config-store.js";

describe("normalizeSchemaInjectionScope", () => {
	it("缺失/非法值返回 undefined（调用方按 all 处理）", () => {
		expect(normalizeSchemaInjectionScope(undefined)).toBeUndefined();
		expect(normalizeSchemaInjectionScope(null)).toBeUndefined();
		expect(normalizeSchemaInjectionScope("all")).toBeUndefined();
		expect(normalizeSchemaInjectionScope(42)).toBeUndefined();
	});

	it("合法 scope 原样保留", () => {
		const value: SchemaInjectionScopeConfig = {
			scope: "connections",
			connections: ["a", "b"],
			tables: [],
		};
		expect(normalizeSchemaInjectionScope(value)).toEqual(value);
	});

	it("非法 scope 回退 all，未知字段忽略", () => {
		expect(normalizeSchemaInjectionScope({ scope: "everything", connections: [], tables: [] })).toEqual({
			scope: "all",
			connections: [],
			tables: [],
		});
	});

	it("connections 过滤非字符串并去重", () => {
		const result = normalizeSchemaInjectionScope({
			scope: "connections",
			connections: ["a", "b", 42, "", "a"],
			tables: [],
		});
		expect(result?.connections).toEqual(["a", "b"]);
	});

	it("tables 过滤缺字段项", () => {
		const result = normalizeSchemaInjectionScope({
			scope: "tables",
			connections: [],
			tables: [{ connection: "a", table: "users" }, { connection: "b" }, { table: "orders" }, null, "junk"],
		});
		expect(result?.tables).toEqual([{ connection: "a", table: "users" }]);
	});
});

describe("normalizeConnectionEnv / normalizeProdWriteApproved", () => {
	it("缺失/非法返回空对象", () => {
		expect(normalizeConnectionEnv(undefined)).toEqual({});
		expect(normalizeConnectionEnv(null)).toEqual({});
		expect(normalizeConnectionEnv("junk")).toEqual({});
		expect(normalizeProdWriteApproved(undefined)).toEqual({});
		expect(normalizeProdWriteApproved(42)).toEqual({});
	});

	it("只保留合法连接名与 prod/dev 值", () => {
		expect(normalizeConnectionEnv({ a: "prod", b: "dev", c: "staging", "": "prod", d: 42 })).toEqual({
			a: "prod",
			b: "dev",
		});
	});

	it("生产写授权只保留 true", () => {
		expect(normalizeProdWriteApproved({ a: true, b: false, c: "yes", "": true })).toEqual({ a: true });
	});
});

describe("normalizeDatabase", () => {
	it("缺失返回全缺省", () => {
		expect(normalizeDatabase(undefined)).toEqual({
			schemaInjection: false,
			dbxToolEnabled: false,
			connectionEnv: {},
			prodWriteApproved: {},
		});
		expect(normalizeDatabase(null)).toEqual({
			schemaInjection: false,
			dbxToolEnabled: false,
			connectionEnv: {},
			prodWriteApproved: {},
		});
	});

	it("boolean 开关归一化", () => {
		const result = normalizeDatabase({ schemaInjection: true, dbxToolEnabled: "yes" });
		expect(result.schemaInjection).toBe(true);
		expect(result.dbxToolEnabled).toBe(false);
	});

	it("schemaInjectionScope 归一化（缺省 undefined）", () => {
		expect(normalizeDatabase({ schemaInjection: true }).schemaInjectionScope).toBeUndefined();
		const result = normalizeDatabase({
			schemaInjection: true,
			schemaInjectionScope: { scope: "tables", connections: [], tables: [{ connection: "a", table: "t" }] },
		});
		expect(result.schemaInjectionScope).toEqual({
			scope: "tables",
			connections: [],
			tables: [{ connection: "a", table: "t" }],
		});
	});

	it("非法 scope 回退 all 且白名单归一化", () => {
		const result = normalizeDatabase({ schemaInjection: true, schemaInjectionScope: { scope: "nope" } });
		expect(result.schemaInjectionScope).toEqual({ scope: "all", connections: [], tables: [] });
	});
});
