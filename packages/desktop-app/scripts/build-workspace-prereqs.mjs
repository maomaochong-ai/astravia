import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, readlink, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

const desktopRoot = join(import.meta.dirname, "..");
const repoRoot = join(desktopRoot, "..", "..");
const cachePath = join(desktopRoot, ".desktop-dev", "workspace-build-cache.json");
const ignoredDirectoryNames = new Set([".git", "dist", "node_modules"]);

const packages = {
	"capability-sdk": { dir: "packages/capability-sdk", dependencies: [] },
	"capability-runtime": { dir: "packages/capability-runtime", dependencies: ["capability-sdk"] },
	ai: { dir: "packages/ai", dependencies: [] },
	"runtime-telemetry": { dir: "packages/runtime-telemetry", dependencies: [] },
	"ecosystem-adapter": { dir: "packages/ecosystem-adapter", dependencies: [] },
	"action-rpc": { dir: "packages/action-rpc", dependencies: [] },
	toolkit: { dir: "packages/toolkit", dependencies: [] },
	"plugin-sdk": { dir: "packages/plugins/plugin-sdk", dependencies: [] },
	"plugin-vite": { dir: "packages/plugins/plugin-vite", dependencies: [] },
	agent: { dir: "packages/agent", dependencies: ["ai", "runtime-telemetry"] },
	"coding-agent": {
		dir: "packages/coding-agent",
		dependencies: ["agent", "ai", "runtime-telemetry", "ecosystem-adapter"],
	},
	"runtime-core": { dir: "packages/runtime-core", dependencies: ["coding-agent", "agent", "ai"] },
	"runtime-tools": { dir: "packages/runtime-tools", dependencies: ["coding-agent"] },
	"runtime-storage": { dir: "packages/runtime-storage", dependencies: ["coding-agent"] },
	"runtime-mcp": { dir: "packages/runtime-mcp", dependencies: ["coding-agent"] },
	"cli-app": {
		dir: "packages/cli-app",
		dependencies: ["action-rpc", "coding-agent", "runtime-core"],
	},
};

const layers = [
	[
		"capability-sdk",
		"ai",
		"runtime-telemetry",
		"ecosystem-adapter",
		"action-rpc",
		"toolkit",
		"plugin-sdk",
		"plugin-vite",
	],
	["capability-runtime", "agent"],
	["coding-agent"],
	["runtime-core", "runtime-tools", "runtime-storage", "runtime-mcp"],
	["cli-app"],
];

async function hashPath(hash, absolutePath) {
	const entries = await readdir(absolutePath, { withFileTypes: true });
	entries.sort((left, right) => left.name.localeCompare(right.name));

	for (const entry of entries) {
		if (entry.isDirectory() && ignoredDirectoryNames.has(entry.name)) {
			continue;
		}

		const entryPath = join(absolutePath, entry.name);
		const relativePath = relative(repoRoot, entryPath).replaceAll("\\", "/");
		hash.update(relativePath);

		if (entry.isDirectory()) {
			await hashPath(hash, entryPath);
		} else if (entry.isSymbolicLink()) {
			hash.update(await readlink(entryPath));
		} else if (entry.isFile()) {
			hash.update(await readFile(entryPath));
		}
	}
}

async function hashFiles(paths) {
	const hash = createHash("sha256");
	for (const filePath of paths) {
		hash.update(filePath);
		hash.update(await readFile(join(repoRoot, filePath)));
	}
	return hash.digest("hex");
}

async function readCache() {
	try {
		return JSON.parse(await readFile(cachePath, "utf8"));
	} catch {
		return { version: 1, packages: {} };
	}
}

function runBuild(name, packageDir) {
	return new Promise((resolve, reject) => {
		console.log(`[workspace-prereqs] 构建 ${name} …`);
		const child = spawn("bun", ["run", "build"], {
			cwd: join(repoRoot, packageDir),
			stdio: "inherit",
		});
		child.once("error", reject);
		child.once("exit", (code, signal) => {
			if (code === 0) {
				resolve();
				return;
			}
			reject(new Error(`${name} 构建失败（code=${code ?? "null"}, signal=${signal ?? "null"}）`));
		});
	});
}

async function main() {
	const force = process.argv.includes("--force");
	const cache = await readCache();
	const nextCache = { version: 1, packages: {} };
	const globalHash = await hashFiles(["package.json", "bun.lock", "tsconfig.base.json"]);
	const buildHashes = new Map();

	for (const layer of layers) {
		await Promise.all(
			layer.map(async (name) => {
				const config = packages[name];
				const sourceHash = createHash("sha256");
				sourceHash.update(globalHash);
				await hashPath(sourceHash, join(repoRoot, config.dir));
				for (const dependency of config.dependencies) {
					sourceHash.update(buildHashes.get(dependency));
				}
				const buildHash = sourceHash.digest("hex");
				buildHashes.set(name, buildHash);

				const distDir = join(repoRoot, config.dir, "dist");
				const unchanged = !force && existsSync(distDir) && cache.packages?.[name] === buildHash;
				if (unchanged) {
					console.log(`[workspace-prereqs] 跳过 ${name}（无变更）`);
				} else {
					await runBuild(name, config.dir);
				}
				nextCache.packages[name] = buildHash;
			}),
		);
	}

	await mkdir(dirname(cachePath), { recursive: true });
	await writeFile(cachePath, `${JSON.stringify(nextCache, null, 2)}\n`, "utf8");
	console.log("[workspace-prereqs] workspace 前置构建完成");
}

await main();
