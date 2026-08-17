/**
 * OAuth 2.0 Device Authorization Grant (RFC 8628) for remote HTTP MCP servers.
 *
 * Used for providers that do NOT support secret-less authorization-code flow
 * (e.g. GitHub, which always requires a client_secret for the code flow but
 * allows the device flow with only a client_id). The resulting user access
 * token is stored in the shared mcp-auth storage as OAuthTokens, so the normal
 * HTTP client OAuth path attaches it as `Authorization: Bearer <token>`.
 */

import { createServer, type Server } from "node:http";
import { getAgentDir } from "../../config.js";
import { type OpenUrlHandler, openUrlInBrowser } from "./mcp-oauth-flow.js";
import { saveMcpOAuthState } from "./mcp-oauth-storage.js";

const DEFAULT_POLL_TIMEOUT_MS = 5 * 60_000;
const DEFAULT_INTERVAL_SEC = 5;
const PLACEHOLDER_REDIRECT = "http://127.0.0.1/callback";

export interface DeviceFlowLoginOptions {
	/** mcp.json server key */
	serverName: string;
	/** Remote MCP endpoint (e.g. https://api.githubcopilot.com/mcp/) */
	serverUrl: string;
	/** Pre-registered public client_id */
	clientId: string;
	/** Space-separated OAuth scopes to request */
	scopes?: string;
	/** Agent config directory */
	agentDir?: string;
	/** Open the verification URL (default: system browser) */
	openUrl?: OpenUrlHandler;
	/** Surface the user code / verification URL to the UI (optional) */
	onUserCode?: (info: { userCode: string; verificationUri: string }) => void | Promise<void>;
	/** Max wait for the user to authorize */
	pollTimeoutMs?: number;
}

export interface DeviceFlowLoginResult {
	serverName: string;
	serverUrl: string;
}

interface DeviceCodeResponse {
	device_code: string;
	user_code: string;
	verification_uri: string;
	verification_uri_complete?: string;
	expires_in: number;
	interval?: number;
}

interface DeviceTokenResponse {
	access_token?: string;
	token_type?: string;
	scope?: string;
	error?: string;
	error_description?: string;
	interval?: number;
}

/**
 * Discover the authorization server (issuer) from the MCP server's protected
 * resource metadata; fall back to GitHub's issuer. Device/token endpoints are
 * derived from the issuer per the provider's convention.
 */
async function discoverEndpoints(serverUrl: string): Promise<{ deviceUrl: string; tokenUrl: string }> {
	let issuer = "https://github.com/login/oauth";
	try {
		const u = new URL(serverUrl);
		const path = u.pathname.replace(/\/$/, "");
		const wellKnown = `${u.origin}/.well-known/oauth-protected-resource${path}`;
		const res = await fetch(wellKnown, { headers: { Accept: "application/json" } });
		if (res.ok) {
			const meta = (await res.json()) as { authorization_servers?: string[] };
			const first = meta.authorization_servers?.[0];
			if (typeof first === "string" && first.trim()) issuer = first.trim().replace(/\/$/, "");
		}
	} catch {
		// Fall back to the default issuer.
	}
	return { deviceUrl: `${issuer}/device/code`, tokenUrl: `${issuer}/access_token` };
}

async function requestDeviceCode(deviceUrl: string, clientId: string, scopes?: string): Promise<DeviceCodeResponse> {
	const body = new URLSearchParams({ client_id: clientId });
	if (scopes?.trim()) body.set("scope", scopes.trim());
	const res = await fetch(deviceUrl, {
		method: "POST",
		headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
		body,
	});
	const text = await res.text();
	if (!res.ok) {
		const hint =
			res.status === 422
				? " (GitHub returns 422 when Device Flow is not enabled for the OAuth/GitHub App — enable it in the app settings)"
				: "";
		throw new Error(`Device code request failed (${res.status})${hint}: ${text.slice(0, 200)}`);
	}
	let json: DeviceCodeResponse;
	try {
		json = JSON.parse(text) as DeviceCodeResponse;
	} catch {
		throw new Error(`Device code endpoint returned non-JSON response: ${text.slice(0, 200)}`);
	}
	if (!json.device_code || !json.user_code || !json.verification_uri) {
		throw new Error(`Device code response missing required fields: ${text.slice(0, 200)}`);
	}
	return json;
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtml(value: string): string {
	return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Serve a small localhost page that shows the user code and links to the
 * provider's device page. Device responses have no pre-filled URL, so the user
 * must read the code and enter it — this page makes that reliable without any
 * renderer/IPC plumbing.
 */
async function startDeviceCodePage(
	userCode: string,
	verificationUri: string,
): Promise<{ url: string; close: () => Promise<void> }> {
	const code = escapeHtml(userCode);
	const uri = escapeHtml(verificationUri);
	const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Connect GitHub</title></head>
<body style="font-family:system-ui,sans-serif;padding:2.5rem;text-align:center;background:#f6f8fa;color:#24292e">
  <h1 style="font-weight:600">Connect GitHub</h1>
  <p>Enter this code on the GitHub page, then click Authorize.</p>
  <div style="font-family:ui-monospace,monospace;font-size:2.2rem;letter-spacing:.2rem;font-weight:700;margin:1.2rem 0;padding:.8rem 1.2rem;background:#fff;border:1px solid #d0d7de;border-radius:10px;display:inline-block">${code}</div>
  <p><button id="copy" style="font-size:1rem;padding:.5rem 1rem;border:1px solid #d0d7de;border-radius:8px;background:#fff;cursor:pointer">Copy code</button></p>
  <p style="margin-top:1.5rem"><a href="${uri}" target="_blank" rel="noopener" style="display:inline-block;font-size:1.05rem;padding:.7rem 1.4rem;background:#1f883d;color:#fff;border-radius:8px;text-decoration:none">Open GitHub to authorize &rarr;</a></p>
  <p style="color:#57606a;margin-top:1.5rem">You can close this window once you have authorized in Astravia.</p>
  <script>
    navigator.clipboard && navigator.clipboard.writeText(${JSON.stringify(userCode)}).catch(() => {});
    document.getElementById('copy').addEventListener('click', () => navigator.clipboard.writeText(${JSON.stringify(userCode)}));
  </script>
</body></html>`;

	const server: Server = createServer((req, res) => {
		if (req.url === "/favicon.ico") {
			res.writeHead(404);
			res.end();
			return;
		}
		res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
		res.end(html);
	});
	const port = await new Promise<number>((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (!address || typeof address === "string") {
				reject(new Error("Failed to bind device-code page server"));
				return;
			}
			resolve(address.port);
		});
	});
	return {
		url: `http://127.0.0.1:${port}/`,
		close: () => new Promise<void>((resolve) => server.close(() => resolve())),
	};
}

/**
 * Poll the token endpoint until the user authorizes, the code expires, or the
 * overall timeout elapses.
 */
async function pollForToken(
	tokenUrl: string,
	clientId: string,
	deviceCode: string,
	intervalSec: number,
	deadline: number,
): Promise<DeviceTokenResponse> {
	let intervalMs = Math.max(intervalSec, 1) * 1000;
	while (Date.now() < deadline) {
		await delay(intervalMs);
		const body = new URLSearchParams({
			client_id: clientId,
			device_code: deviceCode,
			grant_type: "urn:ietf:params:oauth:grant-type:device_code",
		});
		const res = await fetch(tokenUrl, {
			method: "POST",
			headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
			body,
		});
		const text = await res.text();
		let json: DeviceTokenResponse;
		try {
			json = JSON.parse(text) as DeviceTokenResponse;
		} catch {
			throw new Error(`Token endpoint returned non-JSON response: ${text.slice(0, 200)}`);
		}
		if (json.access_token) return json;
		switch (json.error) {
			case "authorization_pending":
				break;
			case "slow_down":
				intervalMs += 5000;
				break;
			case "expired_token":
				throw new Error("Device code expired before authorization. Please try again.");
			case "access_denied":
				throw new Error("Authorization was denied.");
			default:
				throw new Error(json.error_description || json.error || "Device authorization failed");
		}
	}
	throw new Error("Timed out waiting for device authorization.");
}

/**
 * Run the full device authorization flow and persist the resulting user token.
 */
export async function loginMcpDeviceFlow(options: DeviceFlowLoginOptions): Promise<DeviceFlowLoginResult> {
	const serverUrl = options.serverUrl.trim();
	if (!serverUrl) throw new Error("serverUrl is required");
	const serverName = options.serverName.trim();
	if (!serverName) throw new Error("serverName is required");
	const clientId = options.clientId.trim();
	if (!clientId) throw new Error("oauthClientId is required for the device flow");

	const agentDir = options.agentDir ?? getAgentDir();
	const openUrl = options.openUrl ?? openUrlInBrowser;
	const pollTimeoutMs = options.pollTimeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;

	const { deviceUrl, tokenUrl } = await discoverEndpoints(serverUrl);
	const device = await requestDeviceCode(deviceUrl, clientId, options.scopes);

	await options.onUserCode?.({ userCode: device.user_code, verificationUri: device.verification_uri });

	// Device responses carry no pre-filled URL, so show the code on a localhost page
	// that links to GitHub; the page stays up while we poll.
	const page = await startDeviceCodePage(
		device.user_code,
		device.verification_uri_complete ?? device.verification_uri,
	);
	let token: DeviceTokenResponse;
	try {
		await openUrl(page.url);
		const deadline = Date.now() + Math.min(pollTimeoutMs, (device.expires_in || 900) * 1000);
		token = await pollForToken(
			tokenUrl,
			clientId,
			device.device_code,
			device.interval ?? DEFAULT_INTERVAL_SEC,
			deadline,
		);
	} finally {
		await page.close().catch(() => undefined);
	}

	// Persist as OAuthTokens so the HTTP client OAuth path attaches it as Bearer.
	// Omit expires_in/refresh_token: refreshing GitHub tokens needs a client_secret we do
	// not ship, so treat the token as static (disable token expiration on the app).
	saveMcpOAuthState(
		serverName,
		{
			serverUrl,
			redirectUri: PLACEHOLDER_REDIRECT,
			clientInformation: { client_id: clientId },
			tokens: {
				access_token: token.access_token as string,
				token_type: token.token_type || "bearer",
				...(token.scope ? { scope: token.scope } : {}),
			},
		},
		agentDir,
	);

	return { serverName, serverUrl };
}
