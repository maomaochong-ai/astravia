import { execFile } from "node:child_process";
import type {
	InstalledPlugin,
	PluginCommandRunOptions,
	PluginCommandRunResult,
} from "../../preload/api-types/plugins.js";
import { getAppLogger } from "../logger.js";
import { listPlugins } from "./plugin-store.js";

const commandLog = getAppLogger("plugin");

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 120_000;
const MAX_BUFFER_BYTES = 10 * 1024 * 1024; // 10MB stdout/stderr cap

function hasGrantedPermission(plugin: InstalledPlugin, permission: "agent.command.run"): boolean {
	return plugin.permissions.includes(permission) && plugin.grantedPermissions.includes(permission);
}

function clampTimeout(value: unknown): number {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return DEFAULT_TIMEOUT_MS;
	return Math.min(Math.floor(value), MAX_TIMEOUT_MS);
}

function sanitizeArgs(args: unknown): string[] {
	if (args === undefined) return [];
	if (!Array.isArray(args) || args.some((arg) => typeof arg !== "string")) {
		throw new Error("Command args must be an array of strings");
	}
	return args as string[];
}

function sanitizeEnv(env: unknown): Record<string, string> | undefined {
	if (env === undefined) return undefined;
	if (env === null || typeof env !== "object" || Array.isArray(env)) {
		throw new Error("Command env must be a string map");
	}
	const out: Record<string, string> = {};
	for (const [key, value] of Object.entries(env as Record<string, unknown>)) {
		if (typeof value !== "string") throw new Error(`Command env value for ${key} must be a string`);
		out[key] = value;
	}
	return out;
}

/**
 * Run a plugin-declared command in the main process via execFile (no shell).
 * Authoritative gate (defense in depth behind the renderer's own check):
 * the plugin must hold `agent.command.run`, have declared `file`, and have it
 * currently enabled. Returns buffered stdout/stderr + exit code; a non-zero
 * exit resolves normally (the caller inspects exitCode) — only spawn failures
 * (e.g. executable missing) reject.
 */
export async function runPluginCommand(
	pluginId: string,
	file: string,
	args: unknown,
	options: PluginCommandRunOptions | undefined,
): Promise<PluginCommandRunResult> {
	if (typeof pluginId !== "string" || pluginId.trim().length === 0) {
		throw new Error("Invalid plugin id");
	}
	if (typeof file !== "string" || file.trim().length === 0) {
		throw new Error("Invalid command file");
	}
	const plugin = listPlugins().find((candidate) => candidate.id === pluginId);
	if (!plugin) throw new Error(`Plugin not found: ${pluginId}`);
	if (!plugin.enabled) throw new Error(`Plugin disabled: ${pluginId}`);
	if (!hasGrantedPermission(plugin, "agent.command.run")) {
		throw new Error("Plugin permission denied: agent.command.run");
	}
	if (!plugin.declaredCommands.includes(file)) {
		throw new Error(`Command not declared: ${file}`);
	}
	if (!plugin.grantedCommandNames.includes(file)) {
		throw new Error(`Command disabled by user: ${file}`);
	}

	const normalizedArgs = sanitizeArgs(args);
	const env = sanitizeEnv(options?.env);
	const cwd = typeof options?.cwd === "string" && options.cwd.trim().length > 0 ? options.cwd : undefined;
	const timeout = clampTimeout(options?.timeoutMs);

	return new Promise<PluginCommandRunResult>((resolvePromise, rejectPromise) => {
		execFile(
			file,
			normalizedArgs,
			{
				cwd,
				env: env ? { ...process.env, ...env } : process.env,
				timeout,
				maxBuffer: MAX_BUFFER_BYTES,
				windowsHide: true,
				// execFile never uses a shell — args are passed literally.
			},
			(error, stdout, stderr) => {
				if (error) {
					const code = (error as NodeJS.ErrnoException).code;
					// A string code (ENOENT/EACCES/…) means the process never started.
					if (typeof code === "string") {
						commandLog.warn("plugin command spawn failed", { pluginId, file, code });
						rejectPromise(new Error(`Command failed to start: ${file} (${code})`));
						return;
					}
					// Non-zero exit or timeout: resolve with what we captured.
					resolvePromise({
						stdout: stdout.toString(),
						stderr: stderr.toString(),
						exitCode: typeof code === "number" ? code : null,
					});
					return;
				}
				resolvePromise({ stdout: stdout.toString(), stderr: stderr.toString(), exitCode: 0 });
			},
		);
	});
}
