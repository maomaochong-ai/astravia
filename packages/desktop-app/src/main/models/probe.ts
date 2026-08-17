import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getAstraviaHomePath } from "@astravia/action-rpc";
import { net } from "electron";

/**
 * Probe the given (provider, model)'s baseUrl to see if the model server is
 * reachable. Returns ok=true on any HTTP response (including 4xx/5xx — the
 * host answered, auth/path issues are a separate concern), ok=false on
 * network / DNS / TLS failures.
 *
 * Resolves the provider from local models.json (built-in presets are
 * snapshotted there once the user fills in a key).
 *
 * Uses electron.net.fetch deliberately so we go through Chromium's network
 * stack and bypass macOS 15 LNP, same as the GUI session.
 *
 * Shared by the IM bridge model probe and the knowledge-base model probe.
 */
export async function probeModelProvider(ref: {
	provider: string;
	model: string;
}): Promise<{ ok: boolean; message?: string; error?: string }> {
	let provider: { baseUrl?: string } | undefined;
	try {
		const raw = await readFile(join(getAstraviaHomePath(), "agent", "models.json"), "utf8");
		const parsed = JSON.parse(raw) as {
			providers?: Record<string, { baseUrl?: string }>;
		};
		provider = parsed.providers?.[ref.provider];
	} catch {
		// File missing/unreadable is treated the same as "provider not configured".
	}

	if (!provider) {
		return {
			ok: false,
			error: `provider "${ref.provider}" 不在本地 models.json 中`,
		};
	}
	if (!provider.baseUrl) {
		return { ok: false, error: `provider "${ref.provider}" 缺 baseUrl` };
	}

	// Reachability check only — hit the bare origin and treat any HTTP
	// response as "host reachable". Only network / DNS / TLS failures fail.
	let origin: string;
	try {
		const u = new URL(provider.baseUrl);
		origin = `${u.protocol}//${u.host}`;
	} catch {
		return { ok: false, error: `provider "${ref.provider}" 的 baseUrl 解析失败：${provider.baseUrl}` };
	}
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 5_000);
	try {
		await net.fetch(origin, { method: "GET", signal: controller.signal });
		return { ok: true, message: "provider 可达" };
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		const sanitized = msg
			.replace(/https?:\/\/[^\s]+/gi, "目标地址")
			.replace(/\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b/g, "目标地址");
		return { ok: false, error: `provider 不可达：${sanitized}` };
	} finally {
		clearTimeout(timer);
	}
}
