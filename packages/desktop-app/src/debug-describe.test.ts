import { describe, expect, it, vi } from "vitest";
import { databaseService } from "./main/database/database-service.js";
import { getDbxMcpClient } from "./main/database/dbx-mcp-client.js";

vi.mock("../mcp/dbx-mcp-path.js", () => ({
	resolveDbxMcpBinaryPath: () =>
		"E:/open-source-projects/astravia/packages/desktop-app/resources/dbx-mcp/win32-x64/dbx-mcp.exe",
}));
vi.mock("electron", () => ({
	app: { isPackaged: false },
}));

const TEST_DB_PATH = "E:/open-source-projects/astravia/test-db/astravia-test.db";
const connectionName = `debug-describe-${Date.now()}`;

describe("debug dbx_describe_table raw output", () => {
	it("prints raw markdown from dbx_describe_table", async () => {
		const add = await databaseService.addConnection({
			name: connectionName,
			dbType: "sqlite",
			host: TEST_DB_PATH,
		});
		expect(add.ok).toBe(true);

		const client = getDbxMcpClient();
		const raw = await client.callTool("dbx_describe_table", {
			connection_name: connectionName,
			table: "users",
		});
		console.log("=== RAW dbx_describe_table users ===");
		console.log(JSON.stringify(raw, null, 2));
		console.log("=== TEXT ===");
		console.log(raw.content.map((c) => c.text).join("\n"));

		// 无主键表对照
		const noPk = await client.callTool("dbx_describe_table", {
			connection_name: connectionName,
			table: "orders",
		});
		console.log("=== RAW dbx_describe_table orders ===");
		console.log(noPk.content.map((c) => c.text).join("\n"));

		const tables = await databaseService.listTables(connectionName);
		console.log("=== listTables ===");
		console.log(JSON.stringify(tables, null, 2));

		await databaseService.removeConnection(connectionName);
		expect(true).toBe(true);
	});
});
