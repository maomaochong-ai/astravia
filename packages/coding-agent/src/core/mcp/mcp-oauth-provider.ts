/**
 * File-backed OAuthClientProvider for remote HTTP MCP servers.
 *
 * Implements the MCP SDK OAuthClientProvider contract so StreamableHTTPClientTransport
 * can discover metadata, register clients (DCR), exchange codes, and refresh tokens.
 */

import type { OAuthClientProvider, OAuthDiscoveryState } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
	OAuthClientInformationMixed,
	OAuthClientMetadata,
	OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { getAgentDir } from "../../config.js";
import {
	clearMcpOAuthState,
	loadMcpOAuthState,
	type McpOAuthStoredState,
	saveMcpOAuthState,
} from "./mcp-oauth-storage.js";

export interface FileMcpOAuthProviderOptions {
	/** mcp.json server key */
	serverName: string;
	/** MCP server endpoint URL */
	serverUrl: string;
	/** OAuth redirect URI (localhost callback) */
	redirectUri: string;
	/** Called when the user must visit the authorization URL */
	onRedirect: (authorizationUrl: URL) => void | Promise<void>;
	/** Agent config directory (default: getAgentDir()) */
	agentDir?: string;
	/** Display name for dynamic client registration */
	clientName?: string;
	/**
	 * Pre-registered OAuth client_id for servers without DCR (e.g. GitHub).
	 * When set, seeds client information so the SDK skips dynamic registration.
	 */
	clientId?: string;
}

export class FileMcpOAuthProvider implements OAuthClientProvider {
	private readonly serverName: string;
	private readonly serverUrl: string;
	private readonly _redirectUri: string;
	private readonly onRedirect: (authorizationUrl: URL) => void | Promise<void>;
	private readonly agentDir: string;
	private readonly clientName: string;
	private readonly clientId?: string;
	/** Persisted OAuth credentials (named to avoid clashing with OAuthClientProvider.state()) */
	private stored: McpOAuthStoredState;

	constructor(options: FileMcpOAuthProviderOptions) {
		this.serverName = options.serverName;
		this.serverUrl = options.serverUrl;
		this._redirectUri = options.redirectUri;
		this.onRedirect = options.onRedirect;
		this.agentDir = options.agentDir ?? getAgentDir();
		this.clientName = options.clientName ?? "Astravia";
		this.clientId = options.clientId?.trim() || undefined;

		const existing = loadMcpOAuthState(this.serverName, this.agentDir);
		if (!existing || existing.serverUrl !== this.serverUrl) {
			// New server binding — start clean
			this.stored = { serverUrl: this.serverUrl, redirectUri: this._redirectUri };
			this.seedPreRegisteredClient();
			if (existing || this.stored.clientInformation) this.persist();
		} else {
			this.stored = { ...existing, serverUrl: this.serverUrl };
			// Interactive login uses a fresh localhost port. Re-register the OAuth client so
			// redirect_uri matches. Connect-only paths pass the stored redirect (or a
			// placeholder) and must not wipe client_id / tokens.
			const interactiveRedirectChange =
				!isPlaceholderRedirect(this._redirectUri) &&
				Boolean(existing.redirectUri) &&
				existing.redirectUri !== this._redirectUri;
			if (interactiveRedirectChange) {
				// DCR clients must re-register when redirect_uri changes; a pre-registered
				// client_id is stable (GitHub honors RFC 8252 loopback port flexibility), so re-seed it.
				this.stored.clientInformation = undefined;
				this.stored.redirectUri = this._redirectUri;
				this.stored.discoveryState = undefined;
				this.seedPreRegisteredClient();
				this.persist();
			} else {
				if (!this.stored.redirectUri) this.stored.redirectUri = this._redirectUri;
				// Backfill client_id if a prior state predates the pre-registered client.
				if (this.clientId && !this.stored.clientInformation) {
					this.seedPreRegisteredClient();
					this.persist();
				}
			}
		}
	}

	/** Seed a pre-registered client_id so the SDK skips DCR (no-op for DCR servers). */
	private seedPreRegisteredClient(): void {
		if (this.clientId) this.stored.clientInformation = { client_id: this.clientId };
	}

	/** Prefer stored redirect (stable) over constructor placeholder when connecting. */
	get redirectUrl(): string {
		return this.stored.redirectUri || this._redirectUri;
	}

	get clientMetadata(): OAuthClientMetadata {
		const redirect = this.redirectUrl;
		return {
			client_name: this.clientName,
			redirect_uris: [redirect],
			grant_types: ["authorization_code", "refresh_token"],
			response_types: ["code"],
			token_endpoint_auth_method: "none",
		};
	}

	clientInformation(): OAuthClientInformationMixed | undefined {
		return this.stored.clientInformation;
	}

	async saveClientInformation(clientInformation: OAuthClientInformationMixed): Promise<void> {
		this.stored.clientInformation = clientInformation;
		this.persist();
	}

	tokens(): OAuthTokens | undefined {
		return this.stored.tokens;
	}

	async saveTokens(tokens: OAuthTokens): Promise<void> {
		// Prefer rotated refresh_token; keep previous if server omits it
		const previous = this.stored.tokens;
		this.stored.tokens = {
			...tokens,
			refresh_token: tokens.refresh_token ?? previous?.refresh_token,
		};
		// Clear one-shot PKCE verifier after successful token exchange
		this.stored.codeVerifier = undefined;
		this.persist();
	}

	async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
		await this.onRedirect(authorizationUrl);
	}

	async saveCodeVerifier(codeVerifier: string): Promise<void> {
		this.stored.codeVerifier = codeVerifier;
		this.persist();
	}

	async codeVerifier(): Promise<string> {
		if (!this.stored.codeVerifier) {
			throw new Error(`No PKCE code verifier stored for MCP server '${this.serverName}'`);
		}
		return this.stored.codeVerifier;
	}

	async invalidateCredentials(scope: "all" | "client" | "tokens" | "verifier" | "discovery"): Promise<void> {
		if (scope === "all") {
			clearMcpOAuthState(this.serverName, this.agentDir);
			this.stored = { serverUrl: this.serverUrl, redirectUri: this._redirectUri };
			return;
		}
		if (scope === "client") {
			this.stored.clientInformation = undefined;
		} else if (scope === "tokens") {
			this.stored.tokens = undefined;
		} else if (scope === "verifier") {
			this.stored.codeVerifier = undefined;
		} else if (scope === "discovery") {
			this.stored.discoveryState = undefined;
		}
		this.persist();
	}

	async saveDiscoveryState(discovery: OAuthDiscoveryState): Promise<void> {
		this.stored.discoveryState = discovery;
		this.persist();
	}

	discoveryState(): OAuthDiscoveryState | undefined {
		return this.stored.discoveryState;
	}

	private persist(): void {
		saveMcpOAuthState(this.serverName, this.stored, this.agentDir);
	}
}

function isPlaceholderRedirect(redirectUri: string): boolean {
	return (
		redirectUri.includes("127.0.0.1:0") ||
		redirectUri === "http://127.0.0.1/callback" ||
		redirectUri === "http://localhost/callback"
	);
}
