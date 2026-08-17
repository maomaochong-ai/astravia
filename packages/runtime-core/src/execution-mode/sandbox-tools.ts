import type { ToolDefinition } from "@astravia/coding-agent";
import { buildLinuxBubblewrapToolDefinitions, type LinuxBubblewrapToolOptions } from "./linux-bwrap-tools.js";
import { buildMacosSeatbeltToolDefinitions, type MacosSeatbeltToolOptions } from "./macos-seatbelt-tools.js";
import { buildWindowsSandboxToolDefinitions, type WindowsSandboxToolOptions } from "./windows-sandbox-tools.js";

export interface SandboxToolOptions {
	cwd: string;
	platform?: NodeJS.Platform;
	windowsSandboxHostPath?: WindowsSandboxToolOptions["sandboxHostPath"];
	linuxBubblewrapPath?: LinuxBubblewrapToolOptions["bubblewrapPath"];
	macosSandboxExecPath?: MacosSeatbeltToolOptions["sandboxExecPath"];
	/** Resolves the current session id at execute-time. Required for the session-scoped grant cache. */
	getSessionId?: () => string | undefined;
}

export function buildSandboxToolDefinitions(options: SandboxToolOptions): ToolDefinition[] | undefined {
	const platform = options.platform ?? process.platform;
	if (platform === "win32") {
		return buildWindowsSandboxToolDefinitions({
			cwd: options.cwd,
			sandboxHostPath: options.windowsSandboxHostPath,
			getSessionId: options.getSessionId,
		});
	}
	if (platform === "linux") {
		return buildLinuxBubblewrapToolDefinitions({
			cwd: options.cwd,
			bubblewrapPath: options.linuxBubblewrapPath,
			getSessionId: options.getSessionId,
		});
	}
	if (platform === "darwin") {
		return buildMacosSeatbeltToolDefinitions({
			cwd: options.cwd,
			sandboxExecPath: options.macosSandboxExecPath,
			getSessionId: options.getSessionId,
		});
	}
	return undefined;
}
