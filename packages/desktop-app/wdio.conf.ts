import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.dirname(fileURLToPath(import.meta.url));
const mainEntry = path.join(packageRoot, "dist", "main", "index.js");
const userDataDir = path.join(packageRoot, ".wdio-electron-user-data");
const configDirName = ".astravia-e2e";
const require = createRequire(import.meta.url);

/** Set to `1` to use electron-builder unpacked output (`release/*-unpacked`). */
const usePackaged = process.env.ASTRAVIA_E2E_PACKAGED === "1";

function resolvePackagedBinaryPath(): string {
	const candidates =
		process.platform === "win32"
			? [path.join(packageRoot, "release", "win-unpacked", "Astravia.exe")]
			: process.platform === "darwin"
				? [
						path.join(packageRoot, "release", "mac-arm64", "Astravia.app", "Contents", "MacOS", "Astravia"),
						path.join(packageRoot, "release", "mac", "Astravia.app", "Contents", "MacOS", "Astravia"),
						path.join(packageRoot, "release", "mac-x64", "Astravia.app", "Contents", "MacOS", "Astravia"),
					]
				: [path.join(packageRoot, "release", "linux-unpacked", "Astravia")];

	const found = candidates.find((candidate) => existsSync(candidate));
	if (!found) {
		throw new Error(
			[
				"Packaged Electron binary not found. Run a pack script for this platform first, e.g.:",
				"  bun run pack:win:test",
				"  bun run pack:linux:test",
				`Tried:\n${candidates.map((p) => `  - ${p}`).join("\n")}`,
			].join("\n"),
		);
	}
	return found;
}

/**
 * Resolve the real electron executable under node_modules/electron.
 * Avoid official `appEntryPoint` mode: @wdio/electron-service points at
 * node_modules/.bin/electron, which is a .CMD shim under bun and cannot be
 * used as Chromedriver's chrome binary.
 */
function resolveElectronBinaryPath(): string {
	// The electron package exports the absolute path to its dist binary when required from Node.
	const electronBinary = require("electron") as string;
	if (!electronBinary || !existsSync(electronBinary)) {
		throw new Error(
			`Electron binary not found (got: ${String(electronBinary)}). Install the electron dependency in packages/desktop-app.`,
		);
	}
	return electronBinary;
}

function resolveElectronServiceOptions(): {
	appBinaryPath: string;
	appArgs: string[];
} {
	const isolationArgs = [`--user-data-dir=${userDataDir}`];

	if (usePackaged) {
		return {
			appBinaryPath: resolvePackagedBinaryPath(),
			appArgs: isolationArgs,
		};
	}

	if (!existsSync(mainEntry)) {
		throw new Error(
			`Main-process build artifact missing: ${mainEntry}. Run bun run build in packages/desktop-app first (or at least build:main + preload + renderer).`,
		);
	}

	return {
		appBinaryPath: resolveElectronBinaryPath(),
		// Equivalent to official appEntryPoint mode: electron --app=<main>
		appArgs: [`--app=${mainEntry}`, ...isolationArgs],
	};
}

// Child Electron inherits these: isolated config dir + skip dev DevTools.
process.env.ASTRAVIA_E2E = "1";
process.env.ASTRAVIA_CONFIG_DIR = process.env.ASTRAVIA_CONFIG_DIR ?? configDirName;
// App data roots under ASTRAVIA_HOME; user-data-dir only isolates Chromium profile.
process.env.ASTRAVIA_HOME = process.env.ASTRAVIA_HOME ?? path.join(homedir(), configDirName);

const electronServiceOptions = resolveElectronServiceOptions();

/** Excluded from the package tsconfig; loaded by @wdio/cli at runtime. */
export const config = {
	runner: "local",
	// Resolve from packages/desktop-app so monorepo root cwd does not matter.
	rootDir: packageRoot,
	specs: ["./e2e/**/*.e2e.ts"],
	exclude: [],
	maxInstances: 1,
	capabilities: [
		{
			browserName: "electron",
			"wdio:electronServiceOptions": electronServiceOptions,
		},
	],
	logLevel: "warn" as const,
	bail: 0,
	waitforTimeout: 15_000,
	connectionRetryTimeout: 120_000,
	connectionRetryCount: 2,
	services: [
		[
			"electron",
			{
				clearMocks: true,
			},
		],
	],
	framework: "mocha",
	reporters: ["spec"],
	mochaOpts: {
		ui: "bdd",
		timeout: 120_000,
	},
};
