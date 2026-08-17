/**
 * MCP server config declared inside a plugin (stdio or http). Relative paths in
 * stdio `command`/`args`/`cwd` are resolved against the plugin root at contribute time.
 */
export type PluginMcpServerConfig =
	| {
			type?: "stdio";
			command: string;
			args?: string[];
			env?: Record<string, string>;
			cwd?: string;
			disabled?: boolean;
			autoApprove?: string[];
			startupTimeout?: number;
			debug?: boolean;
			displayName?: string;
			description?: string;
			/** 该 server 的工具允许出现的工作模式 slug（agent_mode 轴，缺省/空 = 通用）。见 ADR-0046。 */
			agent_mode?: string | string[];
	  }
	| {
			type: "http";
			url: string;
			headers?: Record<string, string>;
			oauthClientId?: string;
			oauthDeviceFlow?: boolean;
			oauthScopes?: string;
			disabled?: boolean;
			autoApprove?: string[];
			startupTimeout?: number;
			debug?: boolean;
			displayName?: string;
			description?: string;
			/** 该 server 的工具允许出现的工作模式 slug（agent_mode 轴，缺省/空 = 通用）。见 ADR-0046。 */
			agent_mode?: string | string[];
	  };

export interface PluginAgentManifest {
	systemPrompt?: {
		/**
		 * Plugin-packaged prompt contribution file paths. Main-process aggregation
		 * resolves these relative to the installed plugin root.
		 */
		promptPaths?: string[];
	};
	/** Plugin-packaged skill files or directories to add to the agent resource graph. */
	skillPaths?: string[];
	/**
	 * Plugin-scoped MCP servers. Either a relative path to `.mcp.json`
	 * (shape `{ mcpServers: { ... } }`) or an inline map of server configs.
	 * Requires permission `agent.mcp.control`. Never written into user mcp.json.
	 */
	mcpServers?: string | Record<string, PluginMcpServerConfig>;
	/** Declarative tool visibility policy. Names are tool ids after registration. */
	toolPolicy?: {
		allow?: string[];
		deny?: string[];
	};
}
