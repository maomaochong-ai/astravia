/**
 * MCP Configuration Management
 *
 * Handles loading, merging, and validating MCP server configurations
 * from global (~/.astravia/agent/mcp.json) and project (.astravia/mcp.json) locations.
 */

import { createHash } from "crypto";
import { existsSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { CONFIG_DIR_NAME, getAgentDir } from "../../config.js";
import { isHttpServerConfig, type McpConfig, type McpServerConfig } from "./types.js";

/**
 * Load MCP configuration from global and project locations
 */
export class McpConfigLoader {
	private globalConfigPath: string;
	private projectConfigPath: string;
	private projectRoot: string;

	constructor(projectRoot: string = process.cwd(), agentDir: string = getAgentDir()) {
		this.projectRoot = projectRoot;
		this.globalConfigPath = join(agentDir, "mcp.json");
		this.projectConfigPath = join(projectRoot, CONFIG_DIR_NAME, "mcp.json");
	}

	/**
	 * Load global MCP configuration
	 */
	loadGlobal(): McpConfig | null {
		return this.loadConfigFromPath(this.globalConfigPath);
	}

	/**
	 * Load project MCP configuration
	 */
	loadProject(): McpConfig | null {
		return this.loadConfigFromPath(this.projectConfigPath);
	}

	/**
	 * Load and merge both global and project configurations
	 * Project configuration takes precedence over global configuration
	 */
	loadMerged(): McpConfig {
		const globalConfig = this.loadGlobal();
		const projectConfig = this.loadProject();

		if (!globalConfig && !projectConfig) {
			return { mcpServers: {} };
		}

		if (!globalConfig) {
			return this.processConfig(projectConfig!);
		}

		if (!projectConfig) {
			return this.processConfig(globalConfig);
		}

		// Merge configurations (project overrides global)
		const merged = this.mergeConfigs(globalConfig, projectConfig);
		return this.processConfig(merged);
	}

	/**
	 * Load configuration from a specific file path
	 */
	private loadConfigFromPath(path: string): McpConfig | null {
		if (!existsSync(path)) {
			return null;
		}

		try {
			const content = readFileSync(path, "utf-8");
			const config = JSON.parse(content) as McpConfig;
			this.validateConfig(config);
			return config;
		} catch (error) {
			throw new Error(`Failed to load MCP config from ${path}: ${(error as Error).message}`);
		}
	}

	/**
	 * Merge two MCP configurations
	 * Project configuration takes precedence
	 */
	private mergeConfigs(global: McpConfig, project: McpConfig): McpConfig {
		const merged: McpConfig = {
			mcpServers: { ...global.mcpServers },
		};

		// Merge server configurations
		for (const [name, config] of Object.entries(project.mcpServers)) {
			if (merged.mcpServers[name]) {
				// Project config overrides global config for the same server
				merged.mcpServers[name] = {
					...merged.mcpServers[name],
					...config,
				};
			} else {
				merged.mcpServers[name] = config;
			}
		}

		return merged;
	}

	/**
	 * Process configuration: replace environment variables and validate
	 */
	private processConfig(config: McpConfig): McpConfig {
		const processed: McpConfig = {
			mcpServers: {},
		};

		for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
			processed.mcpServers[name] = this.processServerConfig(serverConfig);
		}

		return processed;
	}

	/**
	 * Process a single server configuration
	 */
	private processServerConfig(config: McpServerConfig): McpServerConfig {
		if (isHttpServerConfig(config)) {
			return {
				...config,
				url: this.replaceVariables(config.url),
				headers: config.headers
					? Object.fromEntries(
							Object.entries(config.headers).map(([key, value]) => [key, this.replaceVariables(value)]),
						)
					: undefined,
			};
		}

		return {
			...config,
			command: this.replaceVariables(config.command),
			args: config.args?.map((arg) => this.replaceVariables(arg)),
			cwd: config.cwd ? this.replaceVariables(config.cwd) : undefined,
			env: config.env
				? Object.fromEntries(Object.entries(config.env).map(([key, value]) => [key, this.replaceVariables(value)]))
				: undefined,
		};
	}

	/**
	 * Replace environment variables and special variables in a string
	 * Supports:
	 * - ${VAR_NAME} - environment variable
	 * - ${PROJECT_ROOT} - project root directory
	 */
	private replaceVariables(value: string): string {
		return value.replace(/\$\{([^}]+)\}/g, (match, varName) => {
			// Special variables
			if (varName === "PROJECT_ROOT") {
				return this.projectRoot;
			}

			// Environment variables
			const envValue = process.env[varName];
			if (envValue !== undefined) {
				return envValue;
			}

			// If variable not found, keep the original placeholder
			return match;
		});
	}

	/**
	 * Validate MCP configuration structure
	 */
	private validateConfig(config: any): void {
		if (!config || typeof config !== "object") {
			throw new Error("Invalid MCP config: must be an object");
		}

		if (!config.mcpServers || typeof config.mcpServers !== "object") {
			throw new Error("Invalid MCP config: missing 'mcpServers' object");
		}

		// Validate each server configuration
		for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
			this.validateServerConfig(name, serverConfig);
		}
	}

	/**
	 * Validate a single server configuration
	 */
	private validateServerConfig(name: string, config: any): void {
		if (!config || typeof config !== "object") {
			throw new Error(`Invalid server config for '${name}': must be an object`);
		}

		const type = config.type ?? "stdio";
		if (type !== "stdio" && type !== "http") {
			throw new Error(`Invalid server config for '${name}': 'type' must be "stdio" or "http"`);
		}

		if (type === "http") {
			if (!config.url || typeof config.url !== "string") {
				throw new Error(`Invalid server config for '${name}': missing or invalid 'url'`);
			}
			if (config.headers !== undefined && (typeof config.headers !== "object" || Array.isArray(config.headers))) {
				throw new Error(`Invalid server config for '${name}': 'headers' must be an object`);
			}
		} else {
			if (!config.command || typeof config.command !== "string") {
				throw new Error(`Invalid server config for '${name}': missing or invalid 'command'`);
			}

			if (config.args !== undefined && !Array.isArray(config.args)) {
				throw new Error(`Invalid server config for '${name}': 'args' must be an array`);
			}

			if (config.env !== undefined && typeof config.env !== "object") {
				throw new Error(`Invalid server config for '${name}': 'env' must be an object`);
			}

			if (config.cwd !== undefined && typeof config.cwd !== "string") {
				throw new Error(`Invalid server config for '${name}': 'cwd' must be a string`);
			}
		}

		if (config.disabled !== undefined && typeof config.disabled !== "boolean") {
			throw new Error(`Invalid server config for '${name}': 'disabled' must be a boolean`);
		}

		if (config.autoApprove !== undefined && !Array.isArray(config.autoApprove)) {
			throw new Error(`Invalid server config for '${name}': 'autoApprove' must be an array`);
		}

		if (config.startupTimeout !== undefined && typeof config.startupTimeout !== "number") {
			throw new Error(`Invalid server config for '${name}': 'startupTimeout' must be a number`);
		}

		if (config.debug !== undefined && typeof config.debug !== "boolean") {
			throw new Error(`Invalid server config for '${name}': 'debug' must be a boolean`);
		}
	}

	/**
	 * 计算当前 (global + project) mcp.json 的"快照签名"。
	 *
	 * 用于 prompt 入口处快速判断是否需要 reload：先比 mtime（一次 stat，
	 * <0.1ms），同秒内连续写或 mtime 相同但内容改了的极端情况由 content
	 * hash 兜底。文件不存在时按空串处理；两个文件都不存在签名就是常量
	 * "none"，永远不会触发误重建。
	 */
	getMergedSignature(): string {
		const parts: string[] = [];
		for (const path of [this.globalConfigPath, this.projectConfigPath]) {
			if (!existsSync(path)) {
				parts.push(`${path}:missing`);
				continue;
			}
			try {
				const stat = statSync(path);
				const content = readFileSync(path, "utf-8");
				const hash = createHash("sha1").update(content).digest("hex").slice(0, 16);
				parts.push(`${path}:${stat.mtimeMs}:${hash}`);
			} catch {
				parts.push(`${path}:err`);
			}
		}
		return parts.length === 0 ? "none" : parts.join("|");
	}

	/**
	 * Get configuration file paths
	 */
	getConfigPaths(): { global: string; project: string } {
		return {
			global: this.globalConfigPath,
			project: this.projectConfigPath,
		};
	}
}

/**
 * Helper function to load merged MCP configuration
 */
export function loadMcpConfig(projectRoot?: string): McpConfig {
	const loader = new McpConfigLoader(projectRoot);
	return loader.loadMerged();
}
