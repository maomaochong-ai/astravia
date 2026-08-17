import { existsSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import type { McpConfigData, McpServerConfigData } from "../../preload/api-types/mcp.js";

/**
 * 占位符：内置 dbx 预设的 command 用它占位，写入 mcp.json 前由
 * expandDbxMcpCommand() 展开为 dbx-mcp 二进制绝对路径。
 */
export const DBX_MCP_COMMAND_PLACEHOLDER = "{{dbxMcpBin}}";

/**
 * dbx-mcp 原生二进制绝对路径（随包分发）。
 *
 * 来源：scripts/fetch-dbx-mcp.mjs 下载到 packages/desktop-app/resources/dbx-mcp/，
 * prepare-pack.js 经 extraResources 拷入 Resources/dbx-mcp/（打包后由
 * process.resourcesPath 解析；未打包走 process.cwd()/resources（dev 下
 * app.getAppPath() 指向 dist/main，不可靠，见 im-host/binary-resolver.ts 注释）。
 *
 * B1 仅 Windows x64（见 docs/dbx-main-integration-tasks.md）；macOS/Linux 产物
 * 在 B2 自建构建后接入。
 */
export function resolveDbxMcpBinaryPath(): string {
	const platformDir = "win32-x64";
	const expected = app.isPackaged
		? join(process.resourcesPath, "dbx-mcp", platformDir, "dbx-mcp.exe")
		: join(process.cwd(), "resources", "dbx-mcp", platformDir, "dbx-mcp.exe");
	if (!existsSync(expected)) {
		throw new Error(
			`dbx-mcp binary not found at ${expected}. Run \`bun run prepare:dbx-mcp\` in packages/desktop-app first.`,
		);
	}
	return expected;
}

/**
 * 把 mcp.json 配置里 stdio server 的 {{dbxMcpBin}} 占位符展开为绝对路径。
 * 无占位符时原样返回（避免无谓的对象重建）。
 */
export function expandDbxMcpCommand(config: McpConfigData): McpConfigData {
	let changed = false;
	const mcpServers: Record<string, McpServerConfigData> = {};
	for (const [name, server] of Object.entries(config.mcpServers)) {
		if (server.type !== "http" && server.command.includes(DBX_MCP_COMMAND_PLACEHOLDER)) {
			mcpServers[name] = { ...server, command: resolveDbxMcpBinaryPath() };
			changed = true;
		} else {
			mcpServers[name] = server;
		}
	}
	return changed ? { mcpServers } : config;
}
