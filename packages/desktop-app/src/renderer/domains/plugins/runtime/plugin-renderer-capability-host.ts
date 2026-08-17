import type { PluginTrustLevel } from "@preload/api";

interface RendererPluginSubject {
	readonly enabled: boolean;
	readonly id: string;
	readonly trustLevel: PluginTrustLevel;
}

interface RendererPluginCapabilitySession {
	readonly pluginId: string;
	readonly official: boolean;
}

export class PluginRendererCapabilityHost {
	private readonly sessionIdByPlugin = new Map<string, string>();
	private readonly sessions = new Map<string, RendererPluginCapabilitySession>();

	bindSession(sessionId: string, plugin: RendererPluginSubject): void {
		if (!sessionId.trim()) throw new Error("Plugin renderer capability session id is required");
		if (!plugin.id.trim()) throw new Error("Plugin renderer capability subject id is required");

		const previousSessionId = this.sessionIdByPlugin.get(plugin.id);
		if (previousSessionId) this.sessions.delete(previousSessionId);

		this.sessions.set(sessionId, {
			pluginId: plugin.id,
			official: plugin.enabled && plugin.trustLevel === "official",
		});
		this.sessionIdByPlugin.set(plugin.id, sessionId);
	}

	closeSession(sessionId: string): void {
		const session = this.sessions.get(sessionId);
		if (!session) return;
		this.sessions.delete(sessionId);
		if (this.sessionIdByPlugin.get(session.pluginId) === sessionId) {
			this.sessionIdByPlugin.delete(session.pluginId);
		}
	}

	assertOfficialSession(sessionId: string): void {
		const session = this.sessions.get(sessionId);
		if (!session) throw new Error("Plugin renderer capability session is not active");
		if (!session.official) throw new Error("Plugin official renderer capability access denied");
	}

	invokeOfficial<T>(sessionId: string, operation: () => T): T {
		this.assertOfficialSession(sessionId);
		return operation();
	}
}

export const pluginRendererCapabilityHost = new PluginRendererCapabilityHost();
