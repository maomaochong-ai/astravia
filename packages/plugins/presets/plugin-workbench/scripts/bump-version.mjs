#!/usr/bin/env node
/**
 * Bump plugin.json (and package.json if present) patch version.
 * Usage: node bump-version.mjs <pluginRoot>
 */
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(process.argv[2] ?? ".");
const manifestPath = join(root, "plugin.json");
const pkgPath = join(root, "package.json");

function bumpPatch(version) {
	const m = /^(\d+)\.(\d+)\.(\d+)(.*)$/.exec(version);
	if (!m) throw new Error(`Invalid version: ${version}`);
	return `${m[1]}.${m[2]}.${Number(m[3]) + 1}${m[4] ?? ""}`;
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const next = bumpPatch(manifest.version);
manifest.version = next;
await writeFile(manifestPath, `${JSON.stringify(manifest, null, "\t")}\n`, "utf8");

try {
	const pkg = JSON.parse(await readFile(pkgPath, "utf8"));
	pkg.version = next;
	await writeFile(pkgPath, `${JSON.stringify(pkg, null, "\t")}\n`, "utf8");
} catch {
	// no package.json
}

console.log(JSON.stringify({ ok: true, version: next }, null, 2));
