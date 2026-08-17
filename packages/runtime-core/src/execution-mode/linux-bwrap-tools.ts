import { spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, isAbsolute, join, resolve as resolvePath } from "node:path";
import { getAstraviaHomePath } from "@astravia/action-rpc";
import {
	createBashTool,
	createEditTool,
	createReadTool,
	createWriteTool,
	getShellConfig,
	type ShellOperations,
	type ToolDefinition,
} from "@astravia/coding-agent";
import { getSandboxShellGrant, type SandboxShellGrant } from "./sandbox-permissions.js";
import { wrapShellPermissionGuard, wrapWorkspaceGuard } from "./sandbox-tool-utils.js";

const LINUX_ENV_WHITELIST = [
	"PATH",
	"LANG",
	"LC_ALL",
	"TERM",
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
	"ASTRAVIA_HOME",
	"ASTRAVIA_ACTION_RPC_ENDPOINT_FILE",
	"ASTRAVIA_DESKTOP_EXE",
	"ASTRAVIA_CLI_APP_PATH",
] as const;
const SANDBOX_HOME = "/tmp/astravia-home";
const SANDBOX_BIN_DIR = "/astravia-bin";
const STANDARD_READ_ONLY_ROOTS = ["/usr", "/bin", "/sbin", "/lib", "/lib64", "/etc"] as const;

function killProcessGroup(pid: number): void {
	try {
		process.kill(-pid, "SIGKILL");
	} catch {
		try {
			process.kill(pid, "SIGKILL");
		} catch {
			// Process already exited.
		}
	}
}

function findOnPathUnix(binary: string): string | undefined {
	try {
		const result = spawnSync("which", [binary], { encoding: "utf-8", timeout: 5000 });
		if (result.status !== 0 || !result.stdout) return undefined;
		const firstMatch = result.stdout.trim().split(/\r?\n/)[0];
		return firstMatch && existsSync(firstMatch) ? firstMatch : undefined;
	} catch {
		return undefined;
	}
}

function resolveLinuxBubblewrapPath(explicitPath?: string): string {
	const explicitCandidates = [explicitPath, process.env.ASTRAVIA_LINUX_BWRAP_PATH].filter(
		(value): value is string => typeof value === "string" && value.trim().length > 0,
	);

	for (const candidate of explicitCandidates) {
		if (isAbsolute(candidate) && existsSync(candidate)) {
			return candidate;
		}
		const resolved = findOnPathUnix(candidate);
		if (resolved) return resolved;
	}

	const pathCandidates = ["bwrap", "bubblewrap"];
	for (const candidate of pathCandidates) {
		const resolved = findOnPathUnix(candidate);
		if (resolved) return resolved;
	}

	const searched = [...explicitCandidates, ...pathCandidates].map((item) => `  - ${item}`).join("\n");
	throw new Error(
		"Linux sandbox requires bubblewrap. Install `bwrap`/`bubblewrap` or set ASTRAVIA_LINUX_BWRAP_PATH." +
			`\nSearched:\n${searched}`,
	);
}

function resolveLinuxShellCommand(): { command: string; args: string[] } {
	const shellConfig = getShellConfig();
	const resolvedCommand = isAbsolute(shellConfig.shell) ? shellConfig.shell : findOnPathUnix(shellConfig.shell);

	if (!resolvedCommand) {
		throw new Error(`Linux sandbox shell not found on PATH: ${shellConfig.shell}`);
	}

	return {
		command: resolvedCommand,
		args: shellConfig.args,
	};
}

function ensureShellIsWithinMountedRoots(shellPath: string): void {
	const normalizedShellPath = resolvePath(shellPath);
	const isAllowed = STANDARD_READ_ONLY_ROOTS.some((root) => {
		const normalizedRoot = resolvePath(root);
		return normalizedShellPath === normalizedRoot || normalizedShellPath.startsWith(`${normalizedRoot}/`);
	});

	if (!isAllowed) {
		throw new Error(
			`Linux sandbox cannot run shell outside standard system roots: ${normalizedShellPath}` +
				"\nConfigure shellPath to a binary under /usr, /bin, /sbin, /lib, /lib64, or /etc.",
		);
	}
}

function appendParentDirs(args: string[], targetPath: string, createdDirs: Set<string>): void {
	const segments = resolvePath(targetPath).split("/").filter(Boolean);
	let current = "";
	for (let index = 0; index < segments.length - 1; index++) {
		current += `/${segments[index]}`;
		if (createdDirs.has(current)) continue;
		args.push("--dir", current);
		createdDirs.add(current);
	}
}

function isUnderStandardReadOnlyRoot(path: string): boolean {
	const normalizedPath = resolvePath(path);
	return STANDARD_READ_ONLY_ROOTS.some((root) => {
		const normalizedRoot = resolvePath(root);
		return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`);
	});
}

function existingDir(path: string | undefined): string | undefined {
	if (!path || path.trim().length === 0) return undefined;
	const normalized = resolvePath(path);
	return existsSync(normalized) && !isUnderStandardReadOnlyRoot(normalized) ? normalized : undefined;
}

function existingFile(path: string | undefined): string | undefined {
	if (!path || path.trim().length === 0) return undefined;
	const normalized = resolvePath(path);
	return existsSync(normalized) && !isUnderStandardReadOnlyRoot(normalized) ? normalized : undefined;
}

function collectPathDirs(env: NodeJS.ProcessEnv | undefined): string[] {
	const pathValue = env?.PATH ?? process.env.PATH;
	if (!pathValue) return [];
	return pathValue
		.split(delimiter)
		.map(existingDir)
		.filter((path): path is string => path !== undefined);
}

interface ReadOnlyMounts {
	dirs: string[];
	files: string[];
}

function collectEnvReadOnlyMounts(env: NodeJS.ProcessEnv | undefined): ReadOnlyMounts {
	const dirs = [
		existingDir(env?.npm_config_prefix ?? process.env.npm_config_prefix),
		existingDir(env?.NPM_CONFIG_PREFIX ?? process.env.NPM_CONFIG_PREFIX),
		existingDir(env?.npm_config_cache ?? process.env.npm_config_cache),
		existingDir(env?.NPM_CONFIG_CACHE ?? process.env.NPM_CONFIG_CACHE),
		existingDir(env?.PIP_CACHE_DIR ?? process.env.PIP_CACHE_DIR),
	].filter((path): path is string => path !== undefined);
	const astraviaHome = env?.ASTRAVIA_HOME ?? process.env.ASTRAVIA_HOME;
	const endpointFile =
		env?.ASTRAVIA_ACTION_RPC_ENDPOINT_FILE ??
		process.env.ASTRAVIA_ACTION_RPC_ENDPOINT_FILE ??
		(astraviaHome ? join(astraviaHome, "action-server.json") : undefined);
	const files = [
		env?.npm_config_userconfig ?? process.env.npm_config_userconfig,
		env?.NPM_CONFIG_USERCONFIG ?? process.env.NPM_CONFIG_USERCONFIG,
		env?.PIP_CONFIG_FILE ?? process.env.PIP_CONFIG_FILE,
		endpointFile,
	]
		.map(existingFile)
		.filter((path): path is string => path !== undefined);
	return { dirs, files };
}

function readConfiguredAstraviaPaths(env: NodeJS.ProcessEnv | undefined): {
	astraviaAppPath?: string;
	astraviaCliAppPath?: string;
} {
	const astraviaHome = env?.ASTRAVIA_HOME ?? getAstraviaHomePath();
	const configPath = join(astraviaHome, "desktop-config.json");
	try {
		const parsed = JSON.parse(readFileSync(configPath, "utf-8")) as {
			astraviaAppPath?: unknown;
			astraviaCliAppPath?: unknown;
		};
		return {
			astraviaAppPath: typeof parsed.astraviaAppPath === "string" ? parsed.astraviaAppPath : undefined,
			astraviaCliAppPath: typeof parsed.astraviaCliAppPath === "string" ? parsed.astraviaCliAppPath : undefined,
		};
	} catch {
		return {};
	}
}

function resolveAstraviaDesktopExe(env: NodeJS.ProcessEnv | undefined): string | undefined {
	return existingFile(
		env?.ASTRAVIA_DESKTOP_EXE ?? process.env.ASTRAVIA_DESKTOP_EXE ?? readConfiguredAstraviaPaths(env).astraviaAppPath,
	);
}

function resolveAstraviaCliAppPath(env: NodeJS.ProcessEnv | undefined): string | undefined {
	return existingFile(
		env?.ASTRAVIA_CLI_APP_PATH ??
			process.env.ASTRAVIA_CLI_APP_PATH ??
			readConfiguredAstraviaPaths(env).astraviaCliAppPath,
	);
}

function resolveAstraviaDesktopExeDir(env: NodeJS.ProcessEnv | undefined): string | undefined {
	const astraviaDesktopExe = resolveAstraviaDesktopExe(env);
	return astraviaDesktopExe ? resolvePath(astraviaDesktopExe, "..") : undefined;
}

function resolveAstraviaCliAppDir(env: NodeJS.ProcessEnv | undefined): string | undefined {
	const astraviaCliAppPath = resolveAstraviaCliAppPath(env);
	return astraviaCliAppPath ? resolvePath(astraviaCliAppPath, "..") : undefined;
}

function createAstraviaCliShim(env: NodeJS.ProcessEnv | undefined): { hostDir: string; hostPath: string } | undefined {
	const astraviaCliAppPath = resolveAstraviaCliAppPath(env);
	if (!astraviaCliAppPath) return undefined;
	const hostDir = mkdtempSync(join(tmpdir(), "astravia-linux-sandbox-bin-"));
	const hostPath = join(hostDir, "astravia");
	writeFileSync(hostPath, ["#!/usr/bin/env sh", `exec "${astraviaCliAppPath}" "$@"`, ""].join("\n"), "utf8");
	chmodSync(hostPath, 0o755);
	return { hostDir, hostPath };
}

function buildLinuxSandboxArgs(
	command: string,
	cwd: string,
	shellCommand: { command: string; args: string[] },
	env: NodeJS.ProcessEnv | undefined,
	grant: SandboxShellGrant | undefined,
	astraviaCliShimPath: string | undefined,
): string[] {
	const args: string[] = ["--die-with-parent", "--new-session", "--unshare-pid", "--unshare-ipc", "--unshare-uts"];
	const createdDirs = new Set<string>();
	const mountedRoots = new Set<string>();

	appendParentDirs(args, cwd, createdDirs);
	for (const root of STANDARD_READ_ONLY_ROOTS) {
		if (!existsSync(root) || mountedRoots.has(root)) continue;
		args.push("--ro-bind", root, root);
		mountedRoots.add(root);
	}
	const readOnlyMounts = collectEnvReadOnlyMounts(env);
	const astraviaDesktopExeDir = resolveAstraviaDesktopExeDir(env);
	const astraviaCliAppDir = resolveAstraviaCliAppDir(env);
	for (const root of Array.from(new Set([...collectPathDirs(env), ...readOnlyMounts.dirs]))) {
		if (mountedRoots.has(root)) continue;
		appendParentDirs(args, root, createdDirs);
		args.push("--ro-bind", root, root);
		mountedRoots.add(root);
	}
	for (const file of Array.from(new Set(readOnlyMounts.files))) {
		if (mountedRoots.has(file)) continue;
		appendParentDirs(args, file, createdDirs);
		args.push("--ro-bind", file, file);
		mountedRoots.add(file);
	}

	args.push("--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp");
	appendParentDirs(args, cwd, new Set());
	args.push("--bind", cwd, cwd);
	if (astraviaDesktopExeDir && !mountedRoots.has(astraviaDesktopExeDir)) {
		appendParentDirs(args, astraviaDesktopExeDir, createdDirs);
		args.push("--ro-bind", astraviaDesktopExeDir, astraviaDesktopExeDir);
		mountedRoots.add(astraviaDesktopExeDir);
	}
	if (astraviaCliAppDir && !mountedRoots.has(astraviaCliAppDir)) {
		appendParentDirs(args, astraviaCliAppDir, createdDirs);
		args.push("--ro-bind", astraviaCliAppDir, astraviaCliAppDir);
		mountedRoots.add(astraviaCliAppDir);
	}
	if (astraviaCliShimPath) {
		args.push("--dir", SANDBOX_BIN_DIR, "--ro-bind", astraviaCliShimPath, `${SANDBOX_BIN_DIR}/astravia`);
	}
	for (const root of grant?.allowWriteRoots ?? []) {
		const normalizedRoot = resolvePath(root);
		if (!existsSync(normalizedRoot) || mountedRoots.has(normalizedRoot)) continue;
		appendParentDirs(args, normalizedRoot, createdDirs);
		args.push("--bind", normalizedRoot, normalizedRoot);
		mountedRoots.add(normalizedRoot);
	}
	args.push("--dir", SANDBOX_HOME);

	const baseEnv = env ?? process.env;
	const pathValue = astraviaCliShimPath
		? [SANDBOX_BIN_DIR, baseEnv.PATH].filter((value): value is string => Boolean(value)).join(delimiter)
		: baseEnv.PATH;
	const astraviaDesktopExe = resolveAstraviaDesktopExe(env);
	const astraviaCliAppPath = resolveAstraviaCliAppPath(env);
	args.push("--clearenv");
	for (const key of LINUX_ENV_WHITELIST) {
		const value =
			key === "PATH"
				? pathValue
				: key === "ASTRAVIA_DESKTOP_EXE"
					? astraviaDesktopExe
					: key === "ASTRAVIA_CLI_APP_PATH"
						? astraviaCliAppPath
						: baseEnv[key];
		if (typeof value === "string" && value.length > 0) {
			args.push("--setenv", key, value);
		}
	}
	args.push("--setenv", "HOME", SANDBOX_HOME);
	args.push("--setenv", "TMPDIR", "/tmp");
	args.push("--setenv", "PWD", cwd);
	args.push("--chdir", cwd);
	args.push("--", shellCommand.command, ...shellCommand.args, command);

	return args;
}

function createLinuxBubblewrapShellOperations(bubblewrapPath: string): ShellOperations {
	const shellCommand = resolveLinuxShellCommand();
	ensureShellIsWithinMountedRoots(shellCommand.command);

	return {
		exec: (command, cwd, { onData, signal, timeout, env }) => {
			return new Promise<{ exitCode: number | null }>((resolve, reject) => {
				if (!existsSync(cwd)) {
					reject(new Error(`Working directory does not exist: ${cwd}`));
					return;
				}

				const grant = getSandboxShellGrant(cwd);
				const astraviaCliShim = createAstraviaCliShim(env);
				const args = buildLinuxSandboxArgs(command, cwd, shellCommand, env, grant, astraviaCliShim?.hostPath);
				const child = spawn(bubblewrapPath, args, {
					cwd,
					detached: true,
					stdio: ["ignore", "pipe", "pipe"],
				});

				let timedOut = false;
				let timeoutHandle: NodeJS.Timeout | undefined;

				if (typeof timeout === "number" && timeout > 0) {
					timeoutHandle = setTimeout(() => {
						timedOut = true;
						if (child.pid) {
							killProcessGroup(child.pid);
						}
					}, timeout * 1000);
				}

				if (child.stdout) child.stdout.on("data", onData);
				if (child.stderr) child.stderr.on("data", onData);

				const onAbort = () => {
					if (child.pid) {
						killProcessGroup(child.pid);
					}
				};
				if (signal) {
					if (signal.aborted) {
						onAbort();
					} else {
						signal.addEventListener("abort", onAbort, { once: true });
					}
				}

				child.on("error", (err) => {
					if (timeoutHandle) clearTimeout(timeoutHandle);
					if (signal) signal.removeEventListener("abort", onAbort);
					if (astraviaCliShim) rmSync(astraviaCliShim.hostDir, { recursive: true, force: true });
					reject(err);
				});

				child.on("close", (code) => {
					if (timeoutHandle) clearTimeout(timeoutHandle);
					if (signal) signal.removeEventListener("abort", onAbort);
					if (astraviaCliShim) rmSync(astraviaCliShim.hostDir, { recursive: true, force: true });
					if (signal?.aborted) {
						reject(new Error("aborted"));
						return;
					}
					if (timedOut) {
						reject(new Error(`timeout:${timeout}`));
						return;
					}
					resolve({ exitCode: code });
				});
			});
		},
	};
}

export interface LinuxBubblewrapToolOptions {
	cwd: string;
	bubblewrapPath?: string;
	getSessionId?: () => string | undefined;
}

export function buildLinuxBubblewrapToolDefinitions(options: LinuxBubblewrapToolOptions): ToolDefinition[] {
	const { cwd } = options;
	const bubblewrapPath = resolveLinuxBubblewrapPath(options.bubblewrapPath);
	const guardCtx = { getSessionId: options.getSessionId };

	const readTool = createReadTool(cwd);
	const writeTool = createWriteTool(cwd);
	const editTool = createEditTool(cwd);
	// Use createBashTool (name="bash") rather than createShellTool (name="shell")
	// so that on Linux — where the default active command tool is "bash" — this
	// custom tool actually overrides the unsandboxed default in the registry.
	const bashTool = createBashTool(cwd, {
		operations: createLinuxBubblewrapShellOperations(bubblewrapPath),
	});

	return [
		wrapWorkspaceGuard(readTool, cwd, guardCtx),
		wrapWorkspaceGuard(writeTool, cwd, guardCtx),
		wrapWorkspaceGuard(editTool, cwd, guardCtx),
		wrapShellPermissionGuard(bashTool, cwd, guardCtx),
	];
}
