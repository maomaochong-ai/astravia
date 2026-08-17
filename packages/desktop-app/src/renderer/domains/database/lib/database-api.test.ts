import { describe, expect, it } from "vitest";
import type { DatabaseResult } from "../../../../preload/api-types/database.js";
import { unwrapDatabaseResult } from "./database-api.js";

describe("unwrapDatabaseResult", () => {
	it("成功时返回 data", () => {
		const result: DatabaseResult<string[]> = { ok: true, data: ["users", "orders"] };
		expect(unwrapDatabaseResult(result)).toEqual(["users", "orders"]);
	});

	it("失败时抛 DatabaseError（保留 code）", () => {
		const result: DatabaseResult<string[]> = {
			ok: false,
			error: { code: "SQL_BLOCKED", detail: "High-risk SQL is disabled" },
		};
		expect(() => unwrapDatabaseResult(result)).toThrowError(expect.objectContaining({ code: "SQL_BLOCKED" }));
	});

	it("不同错误码都能透传", () => {
		const codes = ["CONNECTION_NOT_FOUND", "CONNECTION_FAILED", "DBX_NOT_RUNNING", "TIMEOUT", "UNKNOWN"] as const;
		for (const code of codes) {
			const result: DatabaseResult<number> = { ok: false, error: { code, detail: "x" } };
			expect(() => unwrapDatabaseResult(result)).toThrowError(expect.objectContaining({ code }));
		}
	});
});
