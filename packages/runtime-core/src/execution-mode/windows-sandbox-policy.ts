import { homedir } from "node:os";
import { dirname, join, resolve as resolvePath } from "node:path";
import { getAstraviaConfigDirName } from "@astravia/action-rpc";
import type { SandboxShellGrant } from "./sandbox-permissions.js";

export interface SandboxPolicyConfig {
	allowReadRoots: string[];
	allowWriteRoots: string[];
	denyReadRoots: string[];
	denyWriteRoots: string[];
	tempRoot: string;
	allowNetwork: boolean;
}

export interface WindowsSandboxPolicyOptions {
	cwd: string;
	shellCommandPath: string;
	tempRoot: string;
	grant?: SandboxShellGrant;
	env?: NodeJS.ProcessEnv;
}

function uniqueResolved(paths: string[]): string[] {
	return Array.from(new Set(paths.filter((path) => path.trim().length > 0).map((path) => resolvePath(path))));
}

function optionalEnvPath(env: NodeJS.ProcessEnv | undefined, key: string): string | undefined {
	const value = env?.[key] ?? process.env[key];
	return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function optionalEnvDir(env: NodeJS.ProcessEnv | undefined, key: string): string | undefined {
	const value = optionalEnvPath(env, key);
	return value ? dirname(value) : undefined;
}

function compactPaths(paths: Array<string | undefined>): string[] {
	return paths.filter((path): path is string => typeof path === "string" && path.trim().length > 0);
}

export function getWindowsSensitiveDenyRoots(env: NodeJS.ProcessEnv | undefined = process.env): string[] {
	const homeDir = homedir();
	const appData = optionalEnvPath(env, "APPDATA");
	const roots = [
		join(homeDir, ".ssh"),
		join(homeDir, ".aws"),
		join(homeDir, ".gnupg"),
		join(homeDir, ".kube"),
		join(homeDir, ".docker"),
		appData ? join(appData, "gcloud") : undefined,
		appData ? join(appData, "Astravia") : undefined,
		join(homeDir, getAstraviaConfigDirName(), "agent"),
		join(homeDir, ".pi"),
	].filter((path): path is string => typeof path === "string" && path.trim().length > 0);

	return uniqueResolved(roots);
}

export function buildWindowsSandboxPolicy(options: WindowsSandboxPolicyOptions): SandboxPolicyConfig {
	const systemRoot = optionalEnvPath(options.env, "SystemRoot");
	const system32Root = systemRoot ? join(systemRoot, "System32") : undefined;
	const packageManagerReadRoots = compactPaths([
		optionalEnvDir(options.env, "npm_config_userconfig"),
		optionalEnvDir(options.env, "NPM_CONFIG_USERCONFIG"),
		optionalEnvDir(options.env, "PIP_CONFIG_FILE"),
	]);
	const actionRpcReadRoots = compactPaths([
		optionalEnvPath(options.env, "ASTRAVIA_HOME"),
		optionalEnvDir(options.env, "ASTRAVIA_ACTION_RPC_ENDPOINT_FILE"),
		optionalEnvDir(options.env, "ASTRAVIA_DESKTOP_EXE"),
		optionalEnvDir(options.env, "ASTRAVIA_CLI_APP_PATH"),
	]);
	const packageManagerWriteRoots = compactPaths([
		optionalEnvPath(options.env, "npm_config_prefix"),
		optionalEnvPath(options.env, "NPM_CONFIG_PREFIX"),
		optionalEnvPath(options.env, "npm_config_cache"),
		optionalEnvPath(options.env, "NPM_CONFIG_CACHE"),
		optionalEnvPath(options.env, "PIP_CACHE_DIR"),
		optionalEnvPath(options.env, "ASTRAVIA_MANAGED_PYTHON_SITE_PACKAGES"),
		optionalEnvPath(options.env, "ASTRAVIA_MANAGED_PYTHON_SCRIPTS"),
	]);
	const allowReadRoots = uniqueResolved([
		options.cwd,
		options.tempRoot,
		dirname(options.shellCommandPath),
		system32Root ?? "",
		...packageManagerReadRoots,
		...packageManagerWriteRoots,
		...actionRpcReadRoots,
		...(options.grant?.allowReadRoots ?? []),
	]);
	const allowWriteRoots = uniqueResolved([
		options.cwd,
		options.tempRoot,
		...packageManagerWriteRoots,
		...(options.grant?.allowWriteRoots ?? []),
	]);
	const denyRoots = getWindowsSensitiveDenyRoots(options.env);

	return {
		allowReadRoots,
		allowWriteRoots,
		denyReadRoots: denyRoots,
		denyWriteRoots: denyRoots,
		tempRoot: resolvePath(options.tempRoot),
		allowNetwork: false,
	};
}
