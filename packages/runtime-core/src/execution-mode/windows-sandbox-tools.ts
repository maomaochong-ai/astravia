import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import {
	createEditTool,
	createReadTool,
	createShellTool,
	createWriteTool,
	getDefaultShellCommandPrefix,
	prependCommandPrefixes,
	type ShellOperations,
	type ToolDefinition,
} from "@astravia/coding-agent";
import { getSandboxShellGrant } from "./sandbox-permissions.js";
import { wrapShellPermissionGuard, wrapWorkspaceGuard } from "./sandbox-tool-utils.js";
import { buildWindowsSandboxPolicy } from "./windows-sandbox-policy.js";

const WINDOWS_SANDBOX_HOST_FILENAME = "codex-windows-sandbox-host.exe";
const WINDOWS_SANDBOX_HOST_RELATIVE_DIRS = [
	"sandbox/windows",
	"sandbox/bin",
	"sandbox/windows-sandbox-cli",
	"sandbox",
] as const;
const ENV_WHITELIST = [
	"PATH",
	"SystemRoot",
	"COMSPEC",
	"npm_config_registry",
	"npm_config_prefix",
	"npm_config_cache",
	"npm_config_userconfig",
	"NPM_CONFIG_REGISTRY",
	"NPM_CONFIG_PREFIX",
	"NPM_CONFIG_CACHE",
	"NPM_CONFIG_USERCONFIG",
	"PIP_INDEX_URL",
	"PIP_TRUSTED_HOST",
	"PIP_CONFIG_FILE",
	"PIP_CACHE_DIR",
	"ASTRAVIA_MANAGED_PYTHON_SITE_PACKAGES",
	"ASTRAVIA_MANAGED_PYTHON_SCRIPTS",
	"ASTRAVIA_HOME",
	"ASTRAVIA_ACTION_RPC_ENDPOINT_FILE",
	"ASTRAVIA_DESKTOP_EXE",
	"ASTRAVIA_CLI_APP_PATH",
] as const;

type WindowsSandboxBackend = "auto" | "elevated" | "unelevated";

function resolveWindowsSandboxHostPath(explicitPath?: string): string {
	const moduleDir = dirname(fileURLToPath(import.meta.url));
	const runtimeCoreRootCandidates = [
		resolvePath(moduleDir, "../.."),
		resolvePath(moduleDir, "../../../packages/runtime-core"),
		resolvePath(process.cwd(), "packages/runtime-core"),
		resolvePath(process.cwd(), "../runtime-core"),
		resolvePath(process.cwd(), "runtime-core"),
	];
	const autoDetectedCandidates = runtimeCoreRootCandidates.flatMap((rootDir) =>
		WINDOWS_SANDBOX_HOST_RELATIVE_DIRS.map((relativeDir) =>
			resolvePath(rootDir, relativeDir, WINDOWS_SANDBOX_HOST_FILENAME),
		),
	);

	const candidates = [explicitPath, process.env.ASTRAVIA_WINDOWS_SANDBOX_HOST_PATH, ...autoDetectedCandidates].filter(
		(value): value is string => typeof value === "string" && value.trim().length > 0,
	);

	for (const candidate of candidates) {
		if (existsSync(candidate)) return candidate;
	}

	const searched = candidates.map((item) => `  - ${item}`).join("\n");
	throw new Error(
		`Windows sandbox host not found. Set ASTRAVIA_WINDOWS_SANDBOX_HOST_PATH or place ${WINDOWS_SANDBOX_HOST_FILENAME} in packages/runtime-core/sandbox/bin.` +
			`\nSearched:\n${searched}`,
	);
}

function resolveAstraviaCliAppPath(env: NodeJS.ProcessEnv | undefined): string | undefined {
	const value = env?.ASTRAVIA_CLI_APP_PATH ?? process.env.ASTRAVIA_CLI_APP_PATH;
	return typeof value === "string" && value.length > 0 && existsSync(value) ? value : undefined;
}

async function createAstraviaCliShim(
	tempRoot: string,
	env: NodeJS.ProcessEnv | undefined,
): Promise<string | undefined> {
	const astraviaCliAppPath = resolveAstraviaCliAppPath(env);
	if (!astraviaCliAppPath) return undefined;
	const shimDir = join(tempRoot, "bin");
	await mkdir(shimDir, { recursive: true });
	await copyFile(astraviaCliAppPath, join(shimDir, "astravia.exe"));
	return shimDir;
}

function buildSandboxEnv(
	sourceEnv: NodeJS.ProcessEnv | undefined,
	tempRoot: string,
	astraviaShimDir: string | undefined,
): string[] {
	const baseEnv = sourceEnv ?? process.env;
	const args: string[] = ["--clear-env"];
	for (const key of ENV_WHITELIST) {
		const value =
			key === "PATH" && astraviaShimDir
				? [astraviaShimDir, baseEnv.PATH].filter((item): item is string => Boolean(item)).join(delimiter)
				: key === "ASTRAVIA_CLI_APP_PATH"
					? resolveAstraviaCliAppPath(sourceEnv)
					: baseEnv[key];
		if (typeof value === "string" && value.length > 0) {
			args.push("--env", `${key}=${value}`);
		}
	}
	args.push("--env", `TEMP=${tempRoot}`, "--env", `TMP=${tempRoot}`, "--env", "ASTRAVIA_WINDOWS_SANDBOX=1");
	return args;
}

function resolveWindowsSandboxBackend(): WindowsSandboxBackend {
	const raw = process.env.ASTRAVIA_WINDOWS_SANDBOX_BACKEND?.trim().toLowerCase();
	if (raw === "auto" || raw === "elevated" || raw === "unelevated") {
		return raw;
	}

	return "auto";
}

function resolveWindowsShellCommand(): { command: string; args: string[] } {
	const findOnPath = (binary: string): string | undefined => {
		try {
			const result = spawnSync("where", [binary], { encoding: "utf-8", timeout: 5000 });
			if (result.status !== 0 || !result.stdout) return undefined;
			const candidate = result.stdout.trim().split(/\r?\n/)[0];
			return typeof candidate === "string" && candidate.length > 0 && existsSync(candidate) ? candidate : undefined;
		} catch {
			return undefined;
		}
	};

	const pwshPath = findOnPath("pwsh.exe");
	if (pwshPath) {
		return {
			command: pwshPath,
			args: ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command"],
		};
	}
	const powershellPath = findOnPath("powershell.exe");
	if (powershellPath) {
		return {
			command: powershellPath,
			args: ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command"],
		};
	}
	const cmdPath = findOnPath("cmd.exe") ?? "cmd.exe";
	return { command: cmdPath, args: ["/d", "/s", "/c"] };
}

function createWindowsSandboxShellOperations(sandboxHostPath: string): ShellOperations {
	return {
		exec: (command, cwd, { onData, signal, timeout, env }) => {
			return new Promise<{ exitCode: number | null }>((resolve, reject) => {
				void (async () => {
					const tempRoot = await mkdtemp(join(tmpdir(), "astravia-windows-sandbox-"));
					await mkdir(join(tempRoot, "home"), { recursive: true });
					const astraviaShimDir = await createAstraviaCliShim(tempRoot, env);
					const shellCommand = resolveWindowsShellCommand();
					const backend = resolveWindowsSandboxBackend();
					const policy = buildWindowsSandboxPolicy({
						cwd,
						shellCommandPath: shellCommand.command,
						tempRoot,
						grant: getSandboxShellGrant(cwd),
						env,
					});
					const args = [
						"--backend",
						backend,
						"--policy",
						"workspace-write",
						"--policy-cwd",
						cwd,
						"--cwd",
						cwd,
						"--temp-root",
						policy.tempRoot,
						"--network",
						policy.allowNetwork ? "default" : "none",
						...buildSandboxEnv(env, policy.tempRoot, astraviaShimDir),
					];
					for (const root of policy.allowReadRoots) {
						args.push("--read-root", root);
					}
					for (const root of policy.allowWriteRoots) {
						args.push("--write-root", root);
					}
					for (const root of policy.denyReadRoots) {
						args.push("--deny-read-path", root);
					}
					for (const root of policy.denyWriteRoots) {
						args.push("--deny-write-path", root);
					}

					if (typeof timeout === "number" && timeout > 0) {
						args.push("--timeout-ms", String(Math.max(1, Math.floor(timeout * 1000))));
					}

					const resolvedCommand = prependCommandPrefixes(command, [
						getDefaultShellCommandPrefix(shellCommand.command),
					]);
					args.push("--", shellCommand.command, ...shellCommand.args, resolvedCommand);
					const child = spawn(sandboxHostPath, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });

					if (child.stdout) child.stdout.on("data", onData);
					if (child.stderr) child.stderr.on("data", onData);

					const cleanup = (): void => {
						void rm(tempRoot, { recursive: true, force: true });
					};
					const onAbort = () => {
						child.kill();
					};
					if (signal) {
						if (signal.aborted) {
							onAbort();
						} else {
							signal.addEventListener("abort", onAbort, { once: true });
						}
					}

					child.on("error", (err) => {
						if (signal) signal.removeEventListener("abort", onAbort);
						cleanup();
						reject(err);
					});

					child.on("close", (code) => {
						if (signal) signal.removeEventListener("abort", onAbort);
						cleanup();
						if (signal?.aborted) {
							reject(new Error("aborted"));
							return;
						}
						if (code === 192 && typeof timeout === "number" && timeout > 0) {
							reject(new Error(`timeout:${timeout}`));
							return;
						}
						resolve({ exitCode: code });
					});
				})().catch((error: unknown) => {
					reject(error);
				});
			});
		},
	};
}

export interface WindowsSandboxToolOptions {
	cwd: string;
	sandboxHostPath?: string;
	getSessionId?: () => string | undefined;
}

export function buildWindowsSandboxToolDefinitions(options: WindowsSandboxToolOptions): ToolDefinition[] {
	const { cwd } = options;
	const sandboxHostPath = resolveWindowsSandboxHostPath(options.sandboxHostPath);
	const guardCtx = { getSessionId: options.getSessionId };

	const readTool = createReadTool(cwd);
	const writeTool = createWriteTool(cwd);
	const editTool = createEditTool(cwd);
	const shellTool = createShellTool(cwd, {
		operations: createWindowsSandboxShellOperations(sandboxHostPath),
	});

	return [
		wrapWorkspaceGuard(readTool, cwd, guardCtx),
		wrapWorkspaceGuard(writeTool, cwd, guardCtx),
		wrapWorkspaceGuard(editTool, cwd, guardCtx),
		wrapShellPermissionGuard(shellTool, cwd, guardCtx),
	];
}
