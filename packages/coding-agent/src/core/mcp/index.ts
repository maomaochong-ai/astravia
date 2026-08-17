/**
 * MCP (Model Context Protocol) Module
 *
 * Provides integration with MCP servers for extending agent capabilities
 * with external tools and data sources.
 */

// Built-in MCP servers shipped with the host (fourth config source)
// Client
export * from "./mcp-client.js";
// Configuration
export * from "./mcp-config.js";
// OAuth (remote HTTP MCP)
export * from "./mcp-device-flow.js";
// HTTP client
export * from "./mcp-http-client.js";
// Manager
export * from "./mcp-manager.js";
export * from "./mcp-oauth-flow.js";
export * from "./mcp-oauth-provider.js";
export * from "./mcp-oauth-storage.js";
// Process management
export * from "./mcp-process.js";
// Tool adapter
export * from "./mcp-tool-adapter.js";
// Plugin-scoped MCP (third config source)
export * from "./plugin-mcp.js";
// Types
export * from "./types.js";
