import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createMcpManager } from "../src/core/mcp/index.js";

// Bug 3 跟进：验证「AI 访问数据库」开关（mcp.json dbx.disabled）切换后，
// prompt 入口的懒重载（maybeReloadMcpForPrompt → reloadIfChanged）能让存量会话
// 在下一轮 prompt 拿到重新注册的 dbx server。用不存在的命令模拟 server，
// 不依赖真实 MCP 协议，只断言「disabled 跳过 → 配置变更 → diff-reload 重建」。
describe("McpManager disabled-toggle lazy reload", () => {
	it("initialize 跳过 disabled server；配置改为 enabled 后 reloadIfChanged 重建实例", async () => {
		const agentDir = mkdtempSync(join(tmpdir(), "astravia-mcp-reload-"));
		try {
			const mcpPath = join(agentDir, "mcp.json");
			const dbxServer = {
				type: "stdio",
				command: "astravia-no-such-mcp-command-xyz",
				args: [],
			};

			// 初始：开关关（disabled: true）→ initialize 按 disabled 跳过，无实例。
			writeFileSync(mcpPath, JSON.stringify({ mcpServers: { dbx: { ...dbxServer, disabled: true } } }));
			const manager = createMcpManager({ projectRoot: agentDir, agentDir, enabled: true });
			await manager.initialize();
			expect(manager.hasConfigChanged()).toBe(false);
			expect(manager.getServer("dbx")).toBeUndefined();

			// 开关切换：desktop 端 syncDbxToolAccessGate 写 mcp.json，disabled: false。
			writeFileSync(mcpPath, JSON.stringify({ mcpServers: { dbx: dbxServer } }));
			expect(manager.hasConfigChanged()).toBe(true);

			// prompt 入口懒重载：diff-reload 重建 dbx。
			// 命令不存在 → 实例状态为 error，但已进入 servers 表（重建已发生）。
			const changed = await manager.reloadIfChanged();
			expect(changed).toBe(true);
			const dbx = manager.getServer("dbx");
			expect(dbx).toBeDefined();
			expect(dbx?.status).toBe("error");
			expect(manager.hasConfigChanged()).toBe(false);
		} finally {
			rmSync(agentDir, { recursive: true, force: true });
		}
	});

	it("配置无变化时 reloadIfChanged 走 fast-path 不重建", async () => {
		const agentDir = mkdtempSync(join(tmpdir(), "astravia-mcp-reload-"));
		try {
			const mcpPath = join(agentDir, "mcp.json");
			writeFileSync(
				mcpPath,
				JSON.stringify({
					mcpServers: {
						dbx: {
							type: "stdio",
							command: "astravia-no-such-mcp-command-xyz",
							disabled: true,
						},
					},
				}),
			);
			const manager = createMcpManager({ projectRoot: agentDir, agentDir, enabled: true });
			await manager.initialize();
			expect(manager.hasConfigChanged()).toBe(false);

			const changed = await manager.reloadIfChanged();
			expect(changed).toBe(false);
			expect(manager.getServer("dbx")).toBeUndefined();
		} finally {
			rmSync(agentDir, { recursive: true, force: true });
		}
	});
});
