#!/usr/bin/env node
/**
 * Validate plugin.json basics for a user plugin project.
 * Usage: node check-manifest.mjs <pluginRoot>
 */
import { readFile, access } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(process.argv[2] ?? ".");
const manifestPath = join(root, "plugin.json");

async function main() {
	const errors = [];
	const warnings = [];
	let raw;
	try {
		raw = JSON.parse(await readFile(manifestPath, "utf8"));
	} catch (err) {
		console.error(JSON.stringify({ ok: false, errors: [`Cannot read plugin.json: ${err}`] }, null, 2));
		process.exit(1);
	}

	if (typeof raw.id !== "string" || !/^[a-z][a-z0-9-]{0,62}$/.test(raw.id)) {
		errors.push("id must be lowercase kebab-case");
	}
	if (typeof raw.name !== "string" || !raw.name.trim()) errors.push("name is required");
	if (typeof raw.version !== "string" || !/^\d+\.\d+\.\d+/.test(raw.version)) {
		errors.push("version must be semver-like x.y.z");
	}
	if (raw.runtime !== "module-federation") {
		warnings.push("runtime should be module-federation for new plugins");
	}
	if (raw.runtime === "module-federation") {
		if (!raw.moduleFederation?.remoteName) errors.push("moduleFederation.remoteName required");
		if (!raw.moduleFederation?.expose) errors.push("moduleFederation.expose required");
		if (raw.entry !== "dist/mf-manifest.json") {
			warnings.push('entry is usually "dist/mf-manifest.json"');
		}
	}
	if (!Array.isArray(raw.permissions)) warnings.push("permissions should be an array");

	if (raw.agent_mode !== undefined) {
		const modes = Array.isArray(raw.agent_mode) ? raw.agent_mode : [raw.agent_mode];
		const invalid = modes.filter((m) => m !== "work" && m !== "coding");
		if (invalid.length > 0) warnings.push(`agent_mode has unknown values: ${invalid.join(", ")} (allowed: work, coding)`);
	}

	const distEntry = join(root, raw.entry ?? "dist/mf-manifest.json");
	try {
		await access(distEntry);
	} catch {
		warnings.push(`build entry missing (run build): ${raw.entry}`);
	}

	const ok = errors.length === 0;
	console.log(JSON.stringify({ ok, id: raw.id, version: raw.version, errors, warnings }, null, 2));
	process.exit(ok ? 0 : 1);
}

main();
