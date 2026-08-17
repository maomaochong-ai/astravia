/**
 * Plugin-scoped MCP helpers: runtime naming and fingerprinting.
 *
 * Tool adapter names tools as `mcp_${serverName}_${toolName}` and splits on the
 * first `_` after the prefix, so runtime server names must not contain `_`.
 */

import { createHash } from "node:crypto";
import type { McpServerConfig } from "./types.js";

/** Spec passed into McpManager from agent plugin contributions. */
export interface PluginMcpServerSpec {
	runtimeName: string;
	config: McpServerConfig;
}

const RUNTIME_NAME_SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Normalize a plugin-local MCP key (or plugin id segment) for use in a runtime name.
 * Replaces underscores and other non-kebab chars with `-`, collapses repeats, lowercases.
 */
export function normalizePluginMcpNameSegment(raw: string): string {
	const normalized = raw
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-+|-+$/g, "");
	if (!normalized) {
		throw new Error(`Invalid plugin MCP name segment: ${JSON.stringify(raw)}`);
	}
	if (!RUNTIME_NAME_SEGMENT.test(normalized)) {
		throw new Error(`Invalid plugin MCP name segment after normalize: ${JSON.stringify(raw)}`);
	}
	return normalized;
}

/**
 * Build the globally unique runtime server name for a plugin MCP entry.
 * Format: `plugin-<pluginId>-<localName>` (kebab-case, no underscores).
 */
export function buildPluginMcpRuntimeName(pluginId: string, localName: string): string {
	const id = normalizePluginMcpNameSegment(pluginId);
	const local = normalizePluginMcpNameSegment(localName);
	return `plugin-${id}-${local}`;
}

export function isPluginMcpRuntimeName(runtimeName: string): boolean {
	return runtimeName.startsWith("plugin-");
}

/** Stable fingerprint of the current plugin MCP set (order-independent). */
export function fingerprintPluginMcpServers(specs: readonly PluginMcpServerSpec[]): string {
	if (specs.length === 0) return "none";
	const sorted = [...specs].sort((a, b) => a.runtimeName.localeCompare(b.runtimeName));
	const payload = sorted.map((spec) => ({
		runtimeName: spec.runtimeName,
		config: spec.config,
	}));
	return createHash("sha1").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
}
