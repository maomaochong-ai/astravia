/**
 * Interactive OAuth login for remote HTTP MCP servers.
 *
 * Starts a localhost callback server, opens the system browser, exchanges the
 * authorization code via the MCP SDK transport, and persists tokens.
 */

import { exec } from "node:child_process";
import { createServer, type Server } from "node:http";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { getAgentDir } from "../../config.js";
import { FileMcpOAuthProvider } from "./mcp-oauth-provider.js";

const CLIENT_NAME = "Astravia";
const CLIENT_VERSION = "1.0.0";
const DEFAULT_TIMEOUT_MS = 60_000;
const AUTH_WAIT_TIMEOUT_MS = 5 * 60_000;

const SUCCESS_HTML = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Authorization successful</title></head>
<body style="font-family:system-ui,sans-serif;padding:2rem;text-align:center">
  <h1>Authorization successful</h1>
  <p>You can close this window and return to Astravia.</p>
  <script>setTimeout(() => window.close(), 1500)</script>
</body></html>`;

const ERROR_HTML = (message: string) => `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Authorization failed</title></head>
<body style="font-family:system-ui,sans-serif;padding:2rem;text-align:center">
  <h1>Authorization failed</h1>
  <p>${escapeHtml(message)}</p>
  <p>You can close this window and try again in Astravia.</p>
</body></html>`;

function escapeHtml(value: string): string {
	return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export type OpenUrlHandler = (url: string) => void | Promise<void>;

export interface LoginHttpMcpServerOptions {
	/** mcp.json server key */
	serverName: string;
	/** Remote MCP endpoint (e.g. https://mcp.notion.com/mcp) */
	serverUrl: string;
	/** Pre-registered OAuth client_id for servers without DCR (e.g. GitHub) */
	oauthClientId?: string;
	/** Open authorization URL (default: system browser) */
	openUrl?: OpenUrlHandler;
	/** Agent config directory */
	agentDir?: string;
	/** Request timeout for MCP connect */
	timeoutMs?: number;
	/** Max wait for browser callback */
	authTimeoutMs?: number;
}

export interface LoginHttpMcpServerResult {
	serverName: string;
	serverUrl: string;
}

/**
 * Open a URL with the OS default browser.
 * Desktop may pass shell.openExternal instead.
 */
export async function openUrlInBrowser(url: string): Promise<void> {
	const platform = process.platform;
	const command =
		platform === "darwin"
			? `open ${JSON.stringify(url)}`
			: platform === "win32"
				? `cmd /c start "" ${JSON.stringify(url)}`
				: `xdg-open ${JSON.stringify(url)}`;
	await new Promise<void>((resolve, reject) => {
		exec(command, (error) => {
			if (error) reject(error);
			else resolve();
		});
	});
}

/**
 * Wrap fetch so OAuth token-endpoint errors surface the provider's real message
 * instead of a cryptic schema-validation failure. Some providers (e.g. GitHub)
 * return HTTP 200 with an OAuth `error` body on a failed code exchange; the SDK
 * then parses it as tokens and throws an opaque zod error (missing access_token).
 */
function createOAuthDiagnosticFetch(): typeof fetch {
	return async (input, init) => {
		const response = await fetch(input, init);
		const method = (init?.method ?? "GET").toUpperCase();
		if (method !== "POST" || !response.ok) return response;
		let body: string;
		try {
			body = await response.clone().text();
		} catch {
			return response;
		}
		if (/access_token/.test(body) || !/error/i.test(body)) return response;
		const message = extractOAuthError(body);
		if (message) throw new Error(`OAuth authorization failed: ${message}`);
		return response;
	};
}

/** Pull `error`/`error_description` out of a JSON or form-encoded OAuth error body. */
function extractOAuthError(body: string): string | null {
	try {
		const json = JSON.parse(body) as { error?: unknown; error_description?: unknown };
		if (json && typeof json === "object" && typeof json.error === "string") {
			return typeof json.error_description === "string" ? `${json.error}: ${json.error_description}` : json.error;
		}
	} catch {
		const params = new URLSearchParams(body);
		const error = params.get("error");
		if (error) {
			const desc = params.get("error_description");
			return desc ? `${error}: ${desc}` : error;
		}
	}
	return null;
}

interface CallbackServer {
	port: number;
	redirectUri: string;
	waitForCode: (timeoutMs: number) => Promise<string>;
	close: () => Promise<void>;
}

async function startOAuthCallbackServer(): Promise<CallbackServer> {
	let resolveCode: ((code: string) => void) | null = null;
	let rejectCode: ((error: Error) => void) | null = null;
	let settled = false;
	/** Buffer if the browser hits callback before waitForCode is attached */
	let pendingCode: string | null = null;
	let pendingError: Error | null = null;

	const settleOk = (code: string) => {
		if (settled) return;
		if (resolveCode) {
			settled = true;
			resolveCode(code);
		} else {
			pendingCode = code;
		}
	};

	const settleErr = (error: Error) => {
		if (settled) return;
		if (rejectCode) {
			settled = true;
			rejectCode(error);
		} else {
			pendingError = error;
		}
	};

	const server: Server = createServer((req, res) => {
		try {
			const requestUrl = new URL(req.url || "/", "http://127.0.0.1");
			if (requestUrl.pathname === "/favicon.ico") {
				res.writeHead(404);
				res.end();
				return;
			}

			const code = requestUrl.searchParams.get("code");
			const error = requestUrl.searchParams.get("error");
			const errorDescription = requestUrl.searchParams.get("error_description");

			if (code) {
				res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
				res.end(SUCCESS_HTML);
				settleOk(code);
				return;
			}

			const message = errorDescription || error || "Missing authorization code";
			res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
			res.end(ERROR_HTML(message));
			settleErr(new Error(`OAuth authorization failed: ${message}`));
		} catch (err) {
			res.writeHead(500);
			res.end("Internal error");
			settleErr(err instanceof Error ? err : new Error(String(err)));
		}
	});

	const port = await new Promise<number>((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (!address || typeof address === "string") {
				reject(new Error("Failed to bind OAuth callback server"));
				return;
			}
			resolve(address.port);
		});
	});

	const redirectUri = `http://127.0.0.1:${port}/callback`;

	return {
		port,
		redirectUri,
		waitForCode: (timeoutMs: number) =>
			new Promise<string>((resolve, reject) => {
				if (pendingError) {
					settled = true;
					reject(pendingError);
					return;
				}
				if (pendingCode) {
					settled = true;
					resolve(pendingCode);
					return;
				}
				if (settled) {
					reject(new Error("OAuth callback already settled"));
					return;
				}
				const timer = setTimeout(() => {
					if (!settled) {
						settled = true;
						reject(new Error("Timed out waiting for OAuth authorization in the browser"));
					}
				}, timeoutMs);
				resolveCode = (code) => {
					clearTimeout(timer);
					resolve(code);
				};
				rejectCode = (error) => {
					clearTimeout(timer);
					reject(error);
				};
			}),
		close: () =>
			new Promise<void>((resolve) => {
				server.close(() => resolve());
			}),
	};
}

/**
 * Run the full browser OAuth flow for a remote HTTP MCP server and persist tokens.
 * Safe to call from desktop IPC or agent/CLI without an active session.
 */
export async function loginHttpMcpServer(options: LoginHttpMcpServerOptions): Promise<LoginHttpMcpServerResult> {
	const serverUrl = options.serverUrl.trim();
	if (!serverUrl) throw new Error("serverUrl is required");
	const serverName = options.serverName.trim();
	if (!serverName) throw new Error("serverName is required");

	const agentDir = options.agentDir ?? getAgentDir();
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const authTimeoutMs = options.authTimeoutMs ?? AUTH_WAIT_TIMEOUT_MS;
	const openUrl = options.openUrl ?? openUrlInBrowser;

	const callback = await startOAuthCallbackServer();
	let authorizationOpened = false;
	const diagnosticFetch = createOAuthDiagnosticFetch();

	try {
		const provider = new FileMcpOAuthProvider({
			serverName,
			serverUrl,
			redirectUri: callback.redirectUri,
			agentDir,
			clientName: CLIENT_NAME,
			clientId: options.oauthClientId,
			onRedirect: async (authorizationUrl) => {
				authorizationOpened = true;
				await openUrl(authorizationUrl.toString());
			},
		});

		const transport = new StreamableHTTPClientTransport(new URL(serverUrl), {
			authProvider: provider,
			fetch: diagnosticFetch,
		});
		const client = new Client({ name: CLIENT_NAME, version: CLIENT_VERSION }, { capabilities: {} });

		try {
			await client.connect(transport, { timeout: timeoutMs });
			// Already authorized (valid tokens on disk)
			await client.close().catch(() => undefined);
			return { serverName, serverUrl };
		} catch (error) {
			if (!(error instanceof UnauthorizedError)) {
				throw error;
			}
		}

		// Unauthorized: wait for browser callback (redirect should have fired)
		if (!authorizationOpened) {
			// Some SDK paths throw Unauthorized before redirect; force discovery by finishAuth path
			// Wait a moment then still wait for code in case redirect arrives async
		}

		const code = await callback.waitForCode(authTimeoutMs);
		await transport.finishAuth(code);

		// Verify the tokens work by reconnecting once
		const verifyTransport = new StreamableHTTPClientTransport(new URL(serverUrl), {
			authProvider: provider,
			fetch: diagnosticFetch,
		});
		const verifyClient = new Client({ name: CLIENT_NAME, version: CLIENT_VERSION }, { capabilities: {} });
		await verifyClient.connect(verifyTransport, { timeout: timeoutMs });
		await verifyClient.close().catch(() => undefined);

		return { serverName, serverUrl };
	} finally {
		await callback.close().catch(() => undefined);
	}
}
