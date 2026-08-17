import { existsSync } from "node:fs";
import { basename, delimiter } from "node:path";
import { spawn, spawnSync } from "child_process";
import { getBinDir, getSettingsPath } from "../config.js";
import { SettingsManager } from "../core/settings-manager.js";

let cachedShellConfig: { shell: string; args: string[] } | null = null;

export const WINDOWS_POWERSHELL_UTF8_COMMAND_PREFIX = [
	"[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)",
	"$OutputEncoding = [System.Text.UTF8Encoding]::new($false)",
	'$PSDefaultParameterValues["Get-Content:Encoding"] = "UTF8"',
].join("\n");

export function isWindowsPowerShellShell(shellPath: string): boolean {
	const shellName = basename(shellPath).toLowerCase();
	return (
		shellName === "powershell.exe" || shellName === "powershell" || shellName === "pwsh.exe" || shellName === "pwsh"
	);
}

export function getDefaultShellCommandPrefix(shellPath: string): string | undefined {
	if (process.platform !== "win32") return undefined;
	if (!isWindowsPowerShellShell(shellPath)) return undefined;
	return WINDOWS_POWERSHELL_UTF8_COMMAND_PREFIX;
}

export function prependCommandPrefixes(command: string, prefixes: Array<string | undefined>): string {
	const effectivePrefixes = prefixes.filter((prefix): prefix is string => Boolean(prefix?.trim()));
	return [...effectivePrefixes, command].join("\n");
}

/**
 * Find executable on PATH on Windows.
 * Uses `where` and verifies that the path exists.
 */
function findExecutableOnWindows(command: string): string | null {
	try {
		const result = spawnSync("where", [command], { encoding: "utf-8", timeout: 5000 });
		if (result.status === 0 && result.stdout) {
			const firstMatch = result.stdout.trim().split(/\r?\n/)[0];
			if (firstMatch && existsSync(firstMatch)) {
				return firstMatch;
			}
		}
	} catch {
		// Ignore errors
	}
	return null;
}

/**
 * Find bash executable on PATH (Unix only).
 */
function findBashOnPathUnix(): string | null {
	try {
		const result = spawnSync("which", ["bash"], { encoding: "utf-8", timeout: 5000 });
		if (result.status === 0 && result.stdout) {
			const firstMatch = result.stdout.trim().split(/\r?\n/)[0];
			if (firstMatch) {
				return firstMatch;
			}
		}
	} catch {
		// Ignore errors
	}
	return null;
}

/**
 * Get shell configuration based on platform.
 * Resolution order:
 * 1. User-specified shellPath in settings.json
 * 2. On Windows: pwsh.exe, then powershell.exe, then cmd.exe
 * 3. On Unix: /bin/bash, then bash on PATH, then fallback to sh
 */
export function getShellConfig(): { shell: string; args: string[] } {
	if (cachedShellConfig) {
		return cachedShellConfig;
	}

	const settings = SettingsManager.create();
	const customShellPath = settings.getShellPath();

	// 1. Check user-specified shell path
	if (customShellPath) {
		if (existsSync(customShellPath)) {
			cachedShellConfig = { shell: customShellPath, args: ["-c"] };
			return cachedShellConfig;
		}
		throw new Error(
			`Custom shell path not found: ${customShellPath}\nPlease update shellPath in ${getSettingsPath()}`,
		);
	}

	if (process.platform === "win32") {
		// 2. Try PowerShell Core (pwsh)
		const pwsh = findExecutableOnWindows("pwsh.exe");
		if (pwsh) {
			cachedShellConfig = {
				shell: pwsh,
				args: ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command"],
			};
			return cachedShellConfig;
		}

		// 3. Fallback to Windows PowerShell
		const powershell = findExecutableOnWindows("powershell.exe");
		if (powershell) {
			cachedShellConfig = {
				shell: powershell,
				args: ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command"],
			};
			return cachedShellConfig;
		}

		// 4. Final fallback to cmd.exe
		const cmd = findExecutableOnWindows("cmd.exe") ?? "cmd.exe";
		cachedShellConfig = { shell: cmd, args: ["/d", "/s", "/c"] };
		return cachedShellConfig;
	}

	// Unix: try /bin/bash, then bash on PATH, then fallback to sh
	if (existsSync("/bin/bash")) {
		cachedShellConfig = { shell: "/bin/bash", args: ["-c"] };
		return cachedShellConfig;
	}

	const bashOnPath = findBashOnPathUnix();
	if (bashOnPath) {
		cachedShellConfig = { shell: bashOnPath, args: ["-c"] };
		return cachedShellConfig;
	}

	cachedShellConfig = { shell: "sh", args: ["-c"] };
	return cachedShellConfig;
}

export function getShellEnv(): NodeJS.ProcessEnv {
	const binDir = getBinDir();
	const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === "path") ?? "PATH";
	const currentPath = process.env[pathKey] ?? "";
	const pathEntries = currentPath.split(delimiter).filter(Boolean);
	const hasBinDir = pathEntries.includes(binDir);
	const updatedPath = hasBinDir ? currentPath : [binDir, currentPath].filter(Boolean).join(delimiter);

	return {
		...process.env,
		[pathKey]: updatedPath,
	};
}

/**
 * Sanitize binary output for display/storage.
 * Removes characters that crash string-width or cause display issues:
 * - Control characters (except tab, newline, carriage return)
 * - Lone surrogates
 * - Unicode Format characters (crash string-width due to a bug)
 * - Characters with undefined code points
 */
export function sanitizeBinaryOutput(str: string): string {
	// Use Array.from to properly iterate over code points (not code units)
	// This handles surrogate pairs correctly and catches edge cases where
	// codePointAt() might return undefined
	return Array.from(str)
		.filter((char) => {
			// Filter out characters that cause string-width to crash
			// This includes:
			// - Unicode format characters
			// - Lone surrogates (already filtered by Array.from)
			// - Control chars except \t \n \r
			// - Characters with undefined code points

			const code = char.codePointAt(0);

			// Skip if code point is undefined (edge case with invalid strings)
			if (code === undefined) return false;

			// Allow tab, newline, carriage return
			if (code === 0x09 || code === 0x0a || code === 0x0d) return true;

			// Filter out control characters (0x00-0x1F, except 0x09, 0x0a, 0x0x0d)
			if (code <= 0x1f) return false;

			// Filter out Unicode format characters
			if (code >= 0xfff9 && code <= 0xfffb) return false;

			return true;
		})
		.join("");
}

export function decodeTextBuffer(buffer: Buffer): string {
	try {
		new TextDecoder("utf-8", { fatal: true }).decode(buffer);
		return buffer.toString("utf-8");
	} catch {
		return new TextDecoder("gb18030").decode(buffer);
	}
}

/**
 * Kill a process and all its children (cross-platform)
 */
export function killProcessTree(pid: number): void {
	if (process.platform === "win32") {
		// Use taskkill on Windows to kill process tree
		try {
			spawn("taskkill", ["/F", "/T", "/PID", String(pid)], {
				stdio: "ignore",
				detached: true,
			});
		} catch {
			// Ignore errors if taskkill fails
		}
	} else {
		// Use SIGKILL on Unix/Linux/Mac
		try {
			process.kill(-pid, "SIGKILL");
		} catch {
			// Fallback to killing just the child if process group kill fails
			try {
				process.kill(pid, "SIGKILL");
			} catch {
				// Process already dead
			}
		}
	}
}
