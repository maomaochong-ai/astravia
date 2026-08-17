/**
 * MCP JSON-RPC Client
 *
 * Implements the MCP protocol over JSON-RPC 2.0,
 * handling communication with MCP servers.
 */

import { HttpMcpClient } from "./mcp-http-client.js";
import { McpProcess } from "./mcp-process.js";
import {
	type IMcpClient,
	isHttpServerConfig,
	type JsonRpcRequest,
	type JsonRpcResponse,
	type McpInitializeParams,
	type McpInitializeResult,
	type McpPromptsListResult,
	type McpResourceReadParams,
	type McpResourceReadResult,
	type McpResourcesListResult,
	type McpServerConfig,
	type McpStdioServerConfig,
	type McpToolCallParams,
	type McpToolCallResult,
	type McpToolsListResult,
} from "./types.js";

const DEFAULT_TIMEOUT_MS = 30000;

export interface McpClientOptions {
	/** Server configuration (stdio transport) */
	config: McpStdioServerConfig;
	/** Server name (for logging) */
	name: string;
	/** Enable debug logging */
	debug?: boolean;
	/** Default timeout for requests in milliseconds */
	timeout?: number;
}

/**
 * MCP Client implementation
 */
export class McpClient implements IMcpClient {
	private process: McpProcess;
	private name: string;
	private config: McpStdioServerConfig;
	private debug: boolean;
	private timeout: number;
	private nextId: number = 1;
	private pendingRequests: Map<number | string, PendingRequest> = new Map();
	private isInitialized: boolean = false;

	constructor(options: McpClientOptions) {
		this.name = options.name;
		this.config = options.config;
		this.debug = options.debug || options.config.debug || false;
		this.timeout = options.timeout || DEFAULT_TIMEOUT_MS;

		this.process = new McpProcess({
			config: options.config,
			name: options.name,
			debug: this.debug,
		});

		// Listen for messages from the process
		this.process.on("message", (message) => {
			this.handleMessage(message);
		});

		// Listen for process errors
		this.process.on("error", (error) => {
			this.handleProcessError(error);
		});

		// Listen for process exit
		this.process.on("exit", (code, signal) => {
			this.handleProcessExit(code, signal);
		});
	}

	/**
	 * Start the MCP server process and initialize the connection
	 */
	async initialize(params: McpInitializeParams): Promise<McpInitializeResult> {
		// Start the process
		await this.process.start();

		// Send initialize request
		const result = await this.request<McpInitializeResult>("initialize", params);

		// Send initialized notification
		this.notify("notifications/initialized", {});

		this.isInitialized = true;
		return result;
	}

	/**
	 * List available tools
	 */
	async listTools(cursor?: string): Promise<McpToolsListResult> {
		this.ensureInitialized();
		return this.request<McpToolsListResult>("tools/list", cursor ? { cursor } : undefined);
	}

	/**
	 * Call a tool
	 */
	async callTool(name: string, args?: Record<string, any>): Promise<McpToolCallResult> {
		this.ensureInitialized();
		const params: McpToolCallParams = {
			name,
			arguments: args,
		};
		return this.request<McpToolCallResult>("tools/call", params);
	}

	/**
	 * List available resources
	 */
	async listResources(cursor?: string): Promise<McpResourcesListResult> {
		this.ensureInitialized();
		return this.request<McpResourcesListResult>("resources/list", cursor ? { cursor } : undefined);
	}

	/**
	 * Read a resource
	 */
	async readResource(uri: string): Promise<McpResourceReadResult> {
		this.ensureInitialized();
		const params: McpResourceReadParams = { uri };
		return this.request<McpResourceReadResult>("resources/read", params);
	}

	/**
	 * List available prompts
	 */
	async listPrompts(cursor?: string): Promise<McpPromptsListResult> {
		this.ensureInitialized();
		return this.request<McpPromptsListResult>("prompts/list", cursor ? { cursor } : undefined);
	}

	/**
	 * Close the connection
	 */
	async close(): Promise<void> {
		// Cancel all pending requests
		for (const pending of this.pendingRequests.values()) {
			pending.reject(new Error("Connection closed"));
			clearTimeout(pending.timeout);
		}
		this.pendingRequests.clear();

		// Stop the process
		await this.process.stop();
		this.isInitialized = false;
	}

	/**
	 * Send a JSON-RPC request and wait for response
	 */
	private async request<T>(method: string, params?: any): Promise<T> {
		const id = this.nextId++;

		const request: JsonRpcRequest = {
			jsonrpc: "2.0",
			id,
			method,
			params,
		};

		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				this.pendingRequests.delete(id);
				reject(new Error(`Request timeout: ${method}`));
			}, this.timeout);

			this.pendingRequests.set(id, {
				resolve,
				reject,
				timeout,
			});

			try {
				this.process.send(request);
			} catch (error) {
				this.pendingRequests.delete(id);
				clearTimeout(timeout);
				reject(error);
			}
		});
	}

	/**
	 * Send a JSON-RPC notification (no response expected)
	 */
	private notify(method: string, params?: any): void {
		const notification = {
			jsonrpc: "2.0",
			method,
			params,
		};

		this.process.send(notification);
	}

	/**
	 * Handle incoming message from the process
	 */
	private handleMessage(message: any): void {
		// Check if it's a response
		if ("result" in message || "error" in message) {
			this.handleResponse(message as JsonRpcResponse);
		}
		// Check if it's a notification (no response needed)
		else if ("method" in message && !("id" in message)) {
			this.handleNotification(message);
		}
		// Unknown message type
		else {
			this.log(`Unknown message type: ${JSON.stringify(message)}`);
		}
	}

	/**
	 * Handle JSON-RPC response
	 */
	private handleResponse(response: JsonRpcResponse): void {
		const pending = this.pendingRequests.get(response.id);
		if (!pending) {
			this.log(`Received response for unknown request ID: ${response.id}`);
			return;
		}

		this.pendingRequests.delete(response.id);
		clearTimeout(pending.timeout);

		if ("error" in response) {
			const error = new Error(response.error.message);
			(error as any).code = response.error.code;
			(error as any).data = response.error.data;
			pending.reject(error);
		} else {
			pending.resolve(response.result);
		}
	}

	/**
	 * Handle JSON-RPC notification from server
	 */
	private handleNotification(notification: any): void {
		this.log(`Received notification: ${notification.method}`);
		// Handle server-initiated notifications here if needed
		// For now, we just log them
	}

	/**
	 * Handle process error
	 */
	private handleProcessError(error: Error): void {
		this.log(`Process error: ${error.message}`);
		// Reject all pending requests
		for (const pending of this.pendingRequests.values()) {
			pending.reject(error);
			clearTimeout(pending.timeout);
		}
		this.pendingRequests.clear();
	}

	/**
	 * Handle process exit
	 */
	private handleProcessExit(code: number | null, signal: string | null): void {
		this.log(`Process exited: code=${code}, signal=${signal}`);
		// Reject all pending requests
		const error = new Error(`MCP server exited: code=${code}, signal=${signal}`);
		for (const pending of this.pendingRequests.values()) {
			pending.reject(error);
			clearTimeout(pending.timeout);
		}
		this.pendingRequests.clear();
		this.isInitialized = false;
	}

	/**
	 * Ensure the client is initialized
	 */
	private ensureInitialized(): void {
		if (!this.isInitialized) {
			throw new Error("MCP client is not initialized");
		}
	}

	/**
	 * Log a message (if debug is enabled)
	 */
	private log(message: string): void {
		if (this.debug) {
			console.error(`[MCPClient:${this.name}] ${message}`);
		}
	}

	/**
	 * Check if client is initialized
	 */
	isClientInitialized(): boolean {
		return this.isInitialized;
	}

	/**
	 * Get server name
	 */
	getName(): string {
		return this.name;
	}

	/**
	 * Get process ID
	 */
	getPid(): number | undefined {
		return this.process.getPid();
	}
}

interface PendingRequest {
	resolve: (value: any) => void;
	reject: (error: Error) => void;
	timeout: NodeJS.Timeout;
}

/**
 * Common surface returned by createMcpClient — implementations support both
 * stdio child-process and HTTP transports.
 */
export interface McpClientHandle extends IMcpClient {
	getName(): string;
	getPid(): number | undefined;
	isClientInitialized(): boolean;
}

/**
 * Helper function to create an MCP client, dispatching by transport type.
 */
export function createMcpClient(
	name: string,
	config: McpServerConfig,
	options?: { debug?: boolean; timeout?: number; agentDir?: string },
): McpClientHandle {
	if (isHttpServerConfig(config)) {
		return new HttpMcpClient({
			name,
			config,
			debug: options?.debug,
			timeout: options?.timeout,
			agentDir: options?.agentDir,
		});
	}
	return new McpClient({ name, config, debug: options?.debug, timeout: options?.timeout });
}
