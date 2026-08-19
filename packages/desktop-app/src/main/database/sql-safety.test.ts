import { describe, expect, it } from "vitest";
import { isWriteStatement, maybeBlockProdWrite, stripSqlComments } from "./sql-safety.js";

describe("stripSqlComments", () => {
	it("保留普通 SQL", () => {
		expect(stripSqlComments("SELECT 1 FROM t")).toBe("SELECT 1 FROM t");
	});

	it("剥离 -- 行注释", () => {
		expect(stripSqlComments("SELECT 1 -- note\nFROM t")).toBe("SELECT 1 \nFROM t");
	});

	it("剥离 /* */ 块注释", () => {
		expect(stripSqlComments("SELECT /* inline */ 1")).toBe("SELECT  1");
	});

	it("剥离整行注释与跨行块注释", () => {
		expect(stripSqlComments("-- header\nSELECT 1")).toBe("\nSELECT 1");
		expect(stripSqlComments("/* a\nb */ DELETE FROM t")).toBe(" DELETE FROM t");
	});
});

describe("isWriteStatement", () => {
	it("只读语句返回 false", () => {
		expect(isWriteStatement("SELECT * FROM users")).toBe(false);
		expect(isWriteStatement("select id from users where deleted = 0")).toBe(false);
		expect(isWriteStatement("SHOW TABLES")).toBe(false);
		expect(isWriteStatement("DESCRIBE users")).toBe(false);
		expect(isWriteStatement("EXPLAIN SELECT * FROM users")).toBe(false);
		expect(isWriteStatement("PRAGMA table_info(users)")).toBe(false);
		expect(isWriteStatement("USE mydb")).toBe(false);
	});

	it("SELECT 前有注释仍判只读", () => {
		expect(isWriteStatement("-- 查询用户\nSELECT * FROM users")).toBe(false);
		expect(isWriteStatement("/* cache bust */ SELECT 1")).toBe(false);
	});

	it("表名/字符串含写关键字不误报", () => {
		expect(isWriteStatement("SELECT * FROM deleted_rows")).toBe(false);
		expect(isWriteStatement("SELECT * FROM t WHERE name = 'DELETE'")).toBe(false);
		expect(isWriteStatement("SELECT updated_at FROM t")).toBe(false);
	});

	it("写语句返回 true", () => {
		expect(isWriteStatement("INSERT INTO t (a) VALUES (1)")).toBe(true);
		expect(isWriteStatement("UPDATE t SET a = 1 WHERE id = 2")).toBe(true);
		expect(isWriteStatement("DELETE FROM t WHERE id = 1")).toBe(true);
		expect(isWriteStatement("CREATE TABLE t (a int)")).toBe(true);
		expect(isWriteStatement("ALTER TABLE t ADD COLUMN b int")).toBe(true);
		expect(isWriteStatement("DROP TABLE t")).toBe(true);
		expect(isWriteStatement("TRUNCATE TABLE t")).toBe(true);
		expect(isWriteStatement("REPLACE INTO t (a) VALUES (1)")).toBe(true);
		expect(isWriteStatement("GRANT SELECT ON t TO r")).toBe(true);
		expect(isWriteStatement("REVOKE SELECT ON t FROM r")).toBe(true);
	});

	it("带注释的写语句仍判写", () => {
		expect(isWriteStatement("/* 清理 */ DELETE FROM t")).toBe(true);
		expect(isWriteStatement("-- 更新\nUPDATE t SET a = 1")).toBe(true);
	});

	it("WITH（CTE）按主体判定", () => {
		expect(isWriteStatement("WITH cte AS (SELECT 1) SELECT * FROM cte")).toBe(false);
		expect(isWriteStatement("WITH cte AS (SELECT 1) UPDATE t SET a = 1")).toBe(true);
		expect(isWriteStatement("WITH cte AS (SELECT 1) DELETE FROM t WHERE id IN (SELECT id FROM cte)")).toBe(true);
		expect(isWriteStatement("WITH cte AS (SELECT 1) INSERT INTO t SELECT * FROM cte")).toBe(true);
	});

	it("空语句 / 纯注释不算写", () => {
		expect(isWriteStatement("")).toBe(false);
		expect(isWriteStatement("   ")).toBe(false);
		expect(isWriteStatement("-- 只有注释")).toBe(false);
		expect(isWriteStatement("/* 只有注释 */")).toBe(false);
	});

	it("大小写不敏感", () => {
		expect(isWriteStatement("insert into t values (1)")).toBe(true);
		expect(isWriteStatement("SeLeCt 1")).toBe(false);
	});
});

describe("maybeBlockProdWrite", () => {
	it("dev 连接放行写语句", () => {
		expect(maybeBlockProdWrite({ env: "dev", writeApproved: false, sql: "DELETE FROM t" })).toBeNull();
	});

	it("prod 未授权：只读放行", () => {
		expect(maybeBlockProdWrite({ env: "prod", writeApproved: false, sql: "SELECT * FROM t" })).toBeNull();
	});

	it("prod 未授权：写语句拦截", () => {
		const blocked = maybeBlockProdWrite({ env: "prod", writeApproved: false, sql: "DELETE FROM t" });
		expect(blocked).not.toBeNull();
		expect(blocked?.code).toBe("PROD_WRITE_BLOCKED");
	});

	it("prod 已授权：写语句放行", () => {
		expect(maybeBlockProdWrite({ env: "prod", writeApproved: true, sql: "DELETE FROM t" })).toBeNull();
	});
});
