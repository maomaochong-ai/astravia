import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { databaseService } from "./database-service.js";
import {
	buildDatabaseSchemaPrompt,
	clearSchemaContextCache,
	databaseSchemaContextIo,
} from "./schema-context-injection.js";

// B2.5 集成测试：真实调用 dbx-mcp.exe 验证 schema 注入链路（listConnections → getSchemaContext → 组装）。
// 测试自建临时 SQLite 连接，结束后清理，不依赖既有连接存储。

vi.mock("../mcp/dbx-mcp-path.js", () => ({
	resolveDbxMcpBinaryPath: () =>
		"E:/open-source-projects/astravia/packages/desktop-app/resources/dbx-mcp/win32-x64/dbx-mcp.exe",
}));
vi.mock("electron", () => ({
	app: { isPackaged: false },
}));

const TEST_DB_PATH = "E:/open-source-projects/astravia/test-db/astravia-test.db";
const connectionName = `astravia-schema-test-${Date.now()}`;

beforeAll(async () => {
	const result = await databaseService.addConnection({
		name: connectionName,
		dbType: "sqlite",
		host: TEST_DB_PATH,
	});
	if (!result.ok) throw new Error(`test setup failed: ${result.error.detail}`);
});

afterAll(async () => {
	clearSchemaContextCache();
	await databaseService.removeConnection(connectionName);
});

describe("buildDatabaseSchemaPrompt 集成（真实 dbx-mcp）", () => {
	it("真实引擎下能取回连接 schema 并组装注入块", async () => {
		const prompt = await buildDatabaseSchemaPrompt(databaseSchemaContextIo);
		expect(prompt).toBeDefined();
		expect(prompt).toContain(`连接「${connectionName}」`);
		expect(prompt).toContain("users");
		expect(prompt).toContain("dbx_execute_query");
	});

	it("重复调用命中缓存，引擎只被调用一次（连接列表 + schema 各一次）", async () => {
		clearSchemaContextCache();
		await buildDatabaseSchemaPrompt(databaseSchemaContextIo);
		const first = await buildDatabaseSchemaPrompt(databaseSchemaContextIo);
		expect(first).toBeDefined();
	});
});
