/**
 * Persistent OAuth credentials for remote MCP servers.
 *
 * Stored separately from mcp.json under:
 *   ~/.astravia/agent/mcp-auth/<serverName>.json
 *
 * Never put access/refresh tokens into mcp.json.
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { OAuthDiscoveryState } from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthClientInformationMixed, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import { getAgentDir } from "../../config.js";

export interface McpOAuthStoredState {
	/** Server endpoint URL this credential set belongs to */
	serverUrl: string;
	clientInformation?: OAuthClientInformationMixed;
	tokens?: OAuthTokens;
	codeVerifier?: string;
	discoveryState?: OAuthDiscoveryState;
	/** Redirect URI used when the client was registered (must match login) */
	redirectUri?: string;
	updatedAt?: string;
}

function sanitizeServerName(serverName: string): string {
	const cleaned = serverName.trim().replace(/[^a-zA-Z0-9._-]+/g, "_");
	return cleaned.length > 0 ? cleaned : "server";
}

export function getMcpAuthDir(agentDir: string = getAgentDir()): string {
	return join(agentDir, "mcp-auth");
}

export function getMcpAuthPath(serverName: string, agentDir: string = getAgentDir()): string {
	return join(getMcpAuthDir(agentDir), `${sanitizeServerName(serverName)}.json`);
}

export function loadMcpOAuthState(
	serverName: string,
	agentDir: string = getAgentDir(),
): McpOAuthStoredState | undefined {
	const path = getMcpAuthPath(serverName, agentDir);
	if (!existsSync(path)) return undefined;
	try {
		const raw = JSON.parse(readFileSync(path, "utf-8")) as McpOAuthStoredState;
		if (!raw || typeof raw !== "object" || typeof raw.serverUrl !== "string") return undefined;
		return raw;
	} catch {
		return undefined;
	}
}

export function saveMcpOAuthState(
	serverName: string,
	state: McpOAuthStoredState,
	agentDir: string = getAgentDir(),
): void {
	const dir = getMcpAuthDir(agentDir);
	mkdirSync(dir, { recursive: true });
	const path = getMcpAuthPath(serverName, agentDir);
	const payload: McpOAuthStoredState = {
		...state,
		updatedAt: new Date().toISOString(),
	};
	writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

export function clearMcpOAuthState(serverName: string, agentDir: string = getAgentDir()): void {
	const path = getMcpAuthPath(serverName, agentDir);
	if (existsSync(path)) {
		unlinkSync(path);
	}
}

/** True when we have at least an access or refresh token on disk. */
export function hasMcpOAuthTokens(serverName: string, agentDir: string = getAgentDir()): boolean {
	const state = loadMcpOAuthState(serverName, agentDir);
	return Boolean(state?.tokens?.access_token || state?.tokens?.refresh_token);
}
