/**
 * MCP Manager
 *
 * Central manager for all MCP servers, handling initialization,
 * lifecycle management, tool registration, and state management.
 */

import type { AgentTool } from "@astravia/agent-core";
import { getAgentDir } from "../../config.js";
import { createMcpClient } from "./mcp-client.js";
import { McpConfigLoader } from "./mcp-config.js";
import { loginMcpDeviceFlow } from "./mcp-device-flow.js";
import { isMcpAuthRequiredError } from "./mcp-http-client.js";
import { loginHttpMcpServer, type OpenUrlHandler } from "./mcp-oauth-flow.js";
import { clearMcpOAuthState, hasMcpOAuthTokens } from "./mcp-oauth-storage.js";
import { adaptMcpTools } from "./mcp-tool-adapter.js";
import { fingerprintPluginMcpServers, type PluginMcpServerSpec } from "./plugin-mcp.js";
import {
	isHttpServerConfig,
	type McpConfig,
	type McpManagerState,
	type McpServerConfig,
	type McpServerInstance,
	type McpServerStatus,
} from "./types.js";

const MCP_PROTOCOL_VERSION = "2024-11-05";
const CLIENT_NAME = "astravia";
const CLIENT_VERSION = "1.0.0";

export interface McpManagerOptions {
	/** Project root directory */
	projectRoot?: string;
	/** Agent directory (for global config) */
	agentDir?: string;
	/** Enable debug logging */
	debug?: boolean;
	/** Whether MCP is globally enabled */
	enabled?: boolean;
}

/**
 * MCP Manager - manages all MCP servers
 */
export class McpManager {
	private state: McpManagerState;
	private configLoader: McpConfigLoader;
	private projectRoot: string;
	private agentDir: string;
	private debug: boolean;
	/** mcp.json 签名快照，用于 reloadIfChanged 的 fast-path 判等。 */
	private lastSignature: string | undefined;
	/**
	 * Plugin-scoped MCP servers (third config source). Keyed by runtimeName.
	 * Never written to user/project mcp.json; reconciled via setPluginServers.
	 */
	private pluginServers = new Map<string, McpServerConfig>();
	/** Fingerprint of pluginServers for combined hasConfigChanged / reload. */
	private pluginFingerprint = fingerprintPluginMcpServers([]);

	constructor(options: McpManagerOptions = {}) {
		this.projectRoot = options.projectRoot || process.cwd();
		this.agentDir = options.agentDir || getAgentDir();
		this.debug = options.debug || false;
		this.configLoader = new McpConfigLoader(this.projectRoot, this.agentDir);

		this.state = {
			servers: new Map(),
			enabled: options.enabled !== undefined ? options.enabled : true,
		};
	}

	/**
	 * Merge file-based config with in-memory plugin servers.
	 * Plugin runtime names win last (they are namespaced with `plugin-`, so no
	 * real collision).
	 */
	private loadEffectiveConfig(): McpConfig {
		const merged = this.configLoader.loadMerged();
		const mcpServers: Record<string, McpServerConfig> = { ...merged.mcpServers };
		for (const [name, config] of this.pluginServers) {
			mcpServers[name] = config;
		}
		return { mcpServers };
	}

	private combinedSignature(): string {
		return `${this.configLoader.getMergedSignature()}|plugin:${this.pluginFingerprint}`;
	}

	/**
	 * Initialize all MCP servers from configuration
	 */
	async initialize(): Promise<void> {
		if (!this.state.enabled) {
			this.log("MCP is disabled, skipping initialization");
			return;
		}

		try {
			// Load configurations
			this.state.globalConfig = this.configLoader.loadGlobal() || undefined;
			this.state.projectConfig = this.configLoader.loadProject() || undefined;

			// Merge file + plugin configurations
			const mergedConfig = this.loadEffectiveConfig();

			// Initialize servers
			const initPromises: Promise<void>[] = [];
			for (const [name, config] of Object.entries(mergedConfig.mcpServers)) {
				if (!config.disabled) {
					initPromises.push(this.initializeServer(name, config));
				} else {
					this.log(`Skipping disabled server: ${name}`);
				}
			}

			// Wait for all servers to initialize (in parallel)
			await Promise.allSettled(initPromises);

			this.lastSignature = this.combinedSignature();
			this.log(`Initialized ${this.state.servers.size} MCP servers`);
		} catch (error) {
			this.log(`Failed to initialize MCP servers: ${(error as Error).message}`);
			throw error;
		}
	}

	/**
	 * Initialize a single MCP server
	 */
	private async initializeServer(name: string, config: McpServerConfig): Promise<void> {
		this.log(`Initializing server: ${name}`);

		// Create server instance
		const instance: McpServerInstance = {
			name,
			config,
			status: "starting",
			tools: [],
			resources: [],
		};

		this.state.servers.set(name, instance);

		try {
			// Create and start client
			const client = createMcpClient(name, config, {
				debug: this.debug || config.debug,
				agentDir: this.agentDir,
			});

			instance.client = client;
			instance.startedAt = new Date();

			// Initialize connection
			const initResult = await client.initialize({
				protocolVersion: MCP_PROTOCOL_VERSION,
				clientInfo: {
					name: CLIENT_NAME,
					version: CLIENT_VERSION,
				},
				capabilities: {},
			});

			instance.serverInfo = initResult.serverInfo;
			instance.pid = client.getPid();

			// List available tools
			if (initResult.capabilities?.tools) {
				try {
					const toolsResult = await client.listTools();
					instance.tools = toolsResult.tools;
					this.log(`Server ${name} provides ${instance.tools.length} tools`);
				} catch (error) {
					this.log(`Failed to list tools for ${name}: ${(error as Error).message}`);
				}
			}

			// List available resources
			if (initResult.capabilities?.resources) {
				try {
					const resourcesResult = await client.listResources();
					instance.resources = resourcesResult.resources;
					this.log(`Server ${name} provides ${instance.resources.length} resources`);
				} catch (error) {
					this.log(`Failed to list resources for ${name}: ${(error as Error).message}`);
				}
			}

			instance.status = "ready";
			instance.error = undefined;
			this.log(`Server ${name} is ready`);
		} catch (error) {
			if (isMcpAuthRequiredError(error)) {
				instance.status = "needs_auth";
				instance.error = (error as Error).message;
				instance.client = undefined;
				this.log(`Server ${name} needs OAuth authorization`);
				return;
			}
			instance.status = "error";
			instance.error = (error as Error).message;
			this.log(`Failed to initialize server ${name}: ${instance.error}`);
			// Don't throw - allow other servers to initialize
		}
	}

	/**
	 * Run browser OAuth for an HTTP MCP server, persist tokens, and reconnect.
	 * Works even when the server is not currently in the manager (uses mcp.json).
	 */
	async loginServer(name: string, options?: { openUrl?: OpenUrlHandler }): Promise<void> {
		const instance = this.state.servers.get(name);
		const config = instance?.config ?? this.configLoader.loadMerged().mcpServers[name];
		if (!config) {
			throw new Error(`Server '${name}' not found`);
		}
		if (!isHttpServerConfig(config)) {
			throw new Error(`Server '${name}' is not an HTTP MCP server (OAuth only applies to type:http)`);
		}

		if (config.oauthDeviceFlow) {
			if (!config.oauthClientId) {
				throw new Error(`Server '${name}' is missing oauthClientId for the device flow`);
			}
			await loginMcpDeviceFlow({
				serverName: name,
				serverUrl: config.url,
				clientId: config.oauthClientId,
				scopes: config.oauthScopes,
				agentDir: this.agentDir,
				openUrl: options?.openUrl,
			});
		} else {
			await loginHttpMcpServer({
				serverName: name,
				serverUrl: config.url,
				oauthClientId: config.oauthClientId,
				agentDir: this.agentDir,
				openUrl: options?.openUrl,
			});
		}

		// Close any previous client and re-init
		if (instance?.client) {
			try {
				await instance.client.close();
			} catch {
				// ignore
			}
		}
		this.state.servers.delete(name);
		if (!config.disabled) {
			await this.initializeServer(name, config);
		}
	}

	/**
	 * Clear stored OAuth tokens for a server and mark it needs_auth / stopped.
	 */
	async logoutServer(name: string): Promise<void> {
		clearMcpOAuthState(name, this.agentDir);
		const instance = this.state.servers.get(name);
		if (!instance) return;
		if (instance.client) {
			try {
				await instance.client.close();
			} catch {
				// ignore
			}
		}
		instance.client = undefined;
		instance.tools = [];
		instance.resources = [];
		instance.serverInfo = undefined;
		if (isHttpServerConfig(instance.config) && !instance.config.disabled) {
			instance.status = "needs_auth";
			instance.error = "OAuth credentials cleared";
		} else {
			instance.status = "stopped";
		}
	}

	/** Whether the server has OAuth tokens on disk (not necessarily a live connection). */
	hasAuthTokens(name: string): boolean {
		return hasMcpOAuthTokens(name, this.agentDir);
	}

	/**
	 * Get all available MCP tools as AgentTools
	 */
	getTools(): AgentTool[] {
		const tools: AgentTool[] = [];

		for (const instance of this.state.servers.values()) {
			if (instance.status === "ready" && instance.client && instance.tools.length > 0) {
				const adaptedTools = adaptMcpTools(instance.tools, instance.client, instance.name);
				tools.push(...adaptedTools);
			}
		}

		return tools;
	}

	/**
	 * Get a specific server instance
	 */
	getServer(name: string): McpServerInstance | undefined {
		return this.state.servers.get(name);
	}

	/**
	 * Get all server instances
	 */
	getServers(): McpServerInstance[] {
		return Array.from(this.state.servers.values());
	}

	/**
	 * Get servers grouped by status
	 */
	getServersByStatus(): Record<McpServerStatus, McpServerInstance[]> {
		const grouped: Record<McpServerStatus, McpServerInstance[]> = {
			starting: [],
			ready: [],
			error: [],
			stopped: [],
			needs_auth: [],
		};

		for (const instance of this.state.servers.values()) {
			grouped[instance.status].push(instance);
		}

		return grouped;
	}

	/**
	 * Check if a tool should be auto-approved
	 */
	shouldAutoApprove(serverName: string, toolName: string): boolean {
		const instance = this.state.servers.get(serverName);
		if (!instance) {
			return false;
		}

		return instance.config.autoApprove?.includes(toolName) || false;
	}

	/**
	 * 仅探测：mcp.json 或插件 MCP 贡献是否自上次加载后发生变化。无副作用。
	 * 用于 prompt 入口的 fast-path 判等。
	 */
	hasConfigChanged(): boolean {
		if (!this.state.enabled) return false;
		return this.lastSignature !== this.combinedSignature();
	}

	/**
	 * Replace the plugin MCP contribution set and reconcile running servers.
	 * Does not touch user/project mcp.json servers except on name collision
	 * (plugin runtime names are namespaced with `plugin-`).
	 *
	 * @returns whether any server was started/stopped/restarted
	 */
	async setPluginServers(specs: readonly PluginMcpServerSpec[]): Promise<boolean> {
		if (!this.state.enabled) {
			this.pluginServers.clear();
			this.pluginFingerprint = fingerprintPluginMcpServers([]);
			return false;
		}

		const next = new Map<string, McpServerConfig>();
		for (const spec of specs) {
			if (!spec.runtimeName || spec.runtimeName.includes("_")) {
				this.log(`Rejecting plugin MCP server with invalid runtimeName: ${spec.runtimeName}`);
				continue;
			}
			next.set(spec.runtimeName, spec.config);
		}

		const nextFingerprint = fingerprintPluginMcpServers(
			[...next.entries()].map(([runtimeName, config]) => ({ runtimeName, config })),
		);
		if (nextFingerprint === this.pluginFingerprint && this.mapsEqualConfig(this.pluginServers, next)) {
			return false;
		}

		this.pluginServers = next;
		this.pluginFingerprint = nextFingerprint;
		this.log(`Plugin MCP set updated (${next.size} servers), reconciling`);
		const changed = await this.reconcileToEffectiveConfig();
		// Surface plugin MCP boot failures loudly — silent error status was the
		// main reason "plugin tools missing" looked like injection never ran.
		for (const instance of this.state.servers.values()) {
			if (!instance.name.startsWith("plugin-")) continue;
			if (instance.status === "error" || instance.status === "needs_auth") {
				console.error(
					`[MCP] Plugin server ${instance.name} status=${instance.status}: ${instance.error ?? "unknown"}`,
				);
			} else if (instance.status === "ready") {
				this.log(`Plugin server ${instance.name} ready with ${instance.tools.length} tools`);
			}
		}
		return changed;
	}

	private mapsEqualConfig(a: Map<string, McpServerConfig>, b: Map<string, McpServerConfig>): boolean {
		if (a.size !== b.size) return false;
		for (const [name, config] of a) {
			const other = b.get(name);
			if (!other || JSON.stringify(other) !== JSON.stringify(config)) return false;
		}
		return true;
	}

	/**
	 * Diff-reconcile running servers against the effective (file + plugin) config.
	 */
	private async reconcileToEffectiveConfig(): Promise<boolean> {
		let mergedConfig: McpConfig;
		try {
			mergedConfig = this.loadEffectiveConfig();
		} catch (err) {
			this.log(`Failed to load effective MCP config, keeping current state: ${(err as Error).message}`);
			this.lastSignature = this.combinedSignature();
			return false;
		}

		const oldNames = new Set(this.state.servers.keys());
		const newNames = new Set(Object.keys(mergedConfig.mcpServers));
		let changed = false;

		for (const name of oldNames) {
			if (!newNames.has(name)) {
				const instance = this.state.servers.get(name);
				if (instance?.client) {
					try {
						await instance.client.close();
					} catch (err) {
						this.log(`Error closing removed server ${name}: ${(err as Error).message}`);
					}
				}
				this.state.servers.delete(name);
				this.log(`Removed server: ${name}`);
				changed = true;
			}
		}

		const tasks: Promise<void>[] = [];
		for (const [name, newConfig] of Object.entries(mergedConfig.mcpServers)) {
			const oldInstance = this.state.servers.get(name);
			const newDisabled = !!newConfig.disabled;

			if (!oldInstance) {
				if (!newDisabled) {
					tasks.push(this.initializeServer(name, newConfig));
					changed = true;
				}
				continue;
			}

			const oldConfigJson = JSON.stringify(oldInstance.config);
			const newConfigJson = JSON.stringify(newConfig);
			if (oldConfigJson === newConfigJson) {
				continue;
			}

			if (oldInstance.client) {
				try {
					await oldInstance.client.close();
				} catch (err) {
					this.log(`Error closing changed server ${name}: ${(err as Error).message}`);
				}
			}
			this.state.servers.delete(name);
			changed = true;
			if (!newDisabled) {
				tasks.push(this.initializeServer(name, newConfig));
			} else {
				this.log(`Server ${name} is now disabled, kept stopped`);
			}
		}

		await Promise.allSettled(tasks);

		this.state.globalConfig = this.configLoader.loadGlobal() || undefined;
		this.state.projectConfig = this.configLoader.loadProject() || undefined;
		this.lastSignature = this.combinedSignature();

		this.log(`Reconcile done, ${this.state.servers.size} servers active`);
		return changed;
	}

	/**
	 * 若 mcp.json 或插件 MCP 自上次加载以来发生变化，则按需重启变化的 server。
	 *
	 * Fast-path：组合签名相等直接返回 false，0 副作用。
	 * Slow-path：diff 旧/新配置（含插件源），最小化重启。
	 *
	 * @returns 是否真的执行了重启（false = 配置未变 / MCP 关闭）
	 */
	async reloadIfChanged(): Promise<boolean> {
		if (!this.state.enabled) return false;

		const currentSignature = this.combinedSignature();
		if (this.lastSignature !== undefined && this.lastSignature === currentSignature) {
			return false;
		}

		this.log("MCP config changed, diff-reloading");
		return this.reconcileToEffectiveConfig();
	}

	/**
	 * Reload configuration and restart servers.
	 * Preserves the current plugin server set (only re-reads mcp.json files).
	 */
	async reload(): Promise<void> {
		this.log("Reloading MCP configuration");

		// Stop all servers
		await this.shutdown();

		// Clear running instances only; keep pluginServers map
		this.state.servers.clear();
		this.lastSignature = undefined;

		// Reinitialize (file + plugin)
		await this.initialize();
	}

	/**
	 * Enable a specific server
	 */
	async enableServer(name: string): Promise<void> {
		const instance = this.state.servers.get(name);
		if (!instance) {
			throw new Error(`Server '${name}' not found`);
		}

		if (instance.status === "ready") {
			this.log(`Server ${name} is already enabled`);
			return;
		}

		// Update config to enable
		instance.config.disabled = false;

		// Reinitialize the server
		await this.initializeServer(name, instance.config);
	}

	/**
	 * Disable a specific server
	 */
	async disableServer(name: string): Promise<void> {
		const instance = this.state.servers.get(name);
		if (!instance) {
			throw new Error(`Server '${name}' not found`);
		}

		// Update config to disable
		instance.config.disabled = true;

		// Stop the server
		if (instance.client) {
			await instance.client.close();
		}

		instance.status = "stopped";
		instance.client = undefined;
		this.log(`Server ${name} disabled`);
	}

	/**
	 * Shutdown all MCP servers
	 */
	async shutdown(): Promise<void> {
		this.log("Shutting down all MCP servers");

		const shutdownPromises: Promise<void>[] = [];

		for (const instance of this.state.servers.values()) {
			if (instance.client) {
				shutdownPromises.push(
					instance.client.close().catch((error) => {
						this.log(`Error closing server ${instance.name}: ${(error as Error).message}`);
					}),
				);
			}
		}

		await Promise.allSettled(shutdownPromises);

		// Clear all servers
		this.state.servers.clear();
		this.log("All MCP servers shut down");
	}

	/**
	 * Get manager state
	 */
	getState(): Readonly<McpManagerState> {
		return {
			...this.state,
			servers: new Map(this.state.servers),
		};
	}

	/**
	 * Check if MCP is enabled
	 */
	isEnabled(): boolean {
		return this.state.enabled;
	}

	/**
	 * Enable or disable MCP globally
	 */
	setEnabled(enabled: boolean): void {
		this.state.enabled = enabled;
	}

	/**
	 * Get configuration file paths
	 */
	getConfigPaths(): { global: string; project: string } {
		return this.configLoader.getConfigPaths();
	}

	/**
	 * Get summary statistics
	 */
	getStats(): {
		totalServers: number;
		readyServers: number;
		errorServers: number;
		totalTools: number;
		totalResources: number;
	} {
		let readyServers = 0;
		let errorServers = 0;
		let totalTools = 0;
		let totalResources = 0;

		for (const instance of this.state.servers.values()) {
			if (instance.status === "ready") {
				readyServers++;
				totalTools += instance.tools.length;
				totalResources += instance.resources.length;
			} else if (instance.status === "error") {
				errorServers++;
			}
		}

		return {
			totalServers: this.state.servers.size,
			readyServers,
			errorServers,
			totalTools,
			totalResources,
		};
	}

	/**
	 * Log a message (if debug is enabled)
	 */
	private log(message: string): void {
		if (this.debug) {
			console.error(`[MCPManager] ${message}`);
		}
	}
}

/**
 * Create a new MCP manager instance
 */
export function createMcpManager(options?: McpManagerOptions): McpManager {
	return new McpManager(options);
}
