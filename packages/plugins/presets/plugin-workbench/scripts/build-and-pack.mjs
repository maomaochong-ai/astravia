#!/usr/bin/env node
/**
 * Install deps, bump patch, vite build, zip plugin for Astravia install.
 * Uses managed Node/npm (ADR-0011). Does not assume bun.
 *
 * Usage: node build-and-pack.mjs <pluginRoot> [--skip-install] [--no-bump]
 *
 * Output JSON: { ok, zipPath, id, version }
 */
import { spawn } from "node:child_process";
import { access, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
	const out = { root: null, skipInstall: false, noBump: false };
	out.root = argv[0] ? resolve(argv[0]) : null;
	for (const a of argv.slice(1)) {
		if (a === "--skip-install") out.skipInstall = true;
		else if (a === "--no-bump") out.noBump = true;
		else throw new Error(`Unknown arg: ${a}`);
	}
	return out;
}

function run(cmd, args, cwd) {
	return new Promise((resolvePromise, rejectPromise) => {
		const child = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"], shell: false });
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (d) => {
			stdout += d.toString();
		});
		child.stderr.on("data", (d) => {
			stderr += d.toString();
		});
		child.on("error", rejectPromise);
		child.on("close", (code) => {
			if (code === 0) resolvePromise({ stdout, stderr, code });
			else {
				const err = new Error(`${cmd} ${args.join(" ")} failed (exit ${code})\n${stderr || stdout}`);
				err.code = code;
				rejectPromise(err);
			}
		});
	});
}

async function collectFiles(dir, base = dir) {
	const out = [];
	const entries = await readdir(dir, { withFileTypes: true });
	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === "node_modules" || entry.name === ".git") continue;
			out.push(...(await collectFiles(full, base)));
		} else {
			out.push({ fullPath: full, archivePath: relative(base, full).replace(/\\/g, "/") });
		}
	}
	return out;
}

/** Minimal zip writer without third-party deps (store only). */
async function writeZip(files, outputPath) {
	const crcTable = (() => {
		const table = new Uint32Array(256);
		for (let n = 0; n < 256; n++) {
			let c = n;
			for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
			table[n] = c;
		}
		return table;
	})();
	function crc32(buf) {
		let c = 0xffffffff;
		for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
		return (c ^ 0xffffffff) >>> 0;
	}

	const localParts = [];
	const centralParts = [];
	let offset = 0;
	for (const file of files) {
		const data = await readFile(file.fullPath);
		const nameBuf = Buffer.from(file.archivePath, "utf8");
		const crc = crc32(data);
		const local = Buffer.alloc(30 + nameBuf.length);
		local.writeUInt32LE(0x04034b50, 0);
		local.writeUInt16LE(20, 4);
		local.writeUInt16LE(0, 6);
		local.writeUInt16LE(0, 8); // store
		local.writeUInt16LE(0, 10);
		local.writeUInt16LE(0, 12);
		local.writeUInt32LE(crc, 14);
		local.writeUInt32LE(data.length, 18);
		local.writeUInt32LE(data.length, 22);
		local.writeUInt16LE(nameBuf.length, 26);
		local.writeUInt16LE(0, 28);
		nameBuf.copy(local, 30);
		const central = Buffer.alloc(46 + nameBuf.length);
		central.writeUInt32LE(0x02014b50, 0);
		central.writeUInt16LE(20, 4);
		central.writeUInt16LE(20, 6);
		central.writeUInt16LE(0, 8);
		central.writeUInt16LE(0, 10);
		central.writeUInt16LE(0, 12);
		central.writeUInt16LE(0, 14);
		central.writeUInt32LE(crc, 16);
		central.writeUInt32LE(data.length, 20);
		central.writeUInt32LE(data.length, 24);
		central.writeUInt16LE(nameBuf.length, 28);
		central.writeUInt16LE(0, 30);
		central.writeUInt16LE(0, 32);
		central.writeUInt16LE(0, 34);
		central.writeUInt16LE(0, 36);
		central.writeUInt32LE(0, 38);
		central.writeUInt32LE(offset, 42);
		nameBuf.copy(central, 46);
		localParts.push(local, data);
		centralParts.push(central);
		offset += local.length + data.length;
	}
	const centralSize = centralParts.reduce((n, b) => n + b.length, 0);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0);
	end.writeUInt16LE(0, 4);
	end.writeUInt16LE(0, 6);
	end.writeUInt16LE(files.length, 8);
	end.writeUInt16LE(files.length, 10);
	end.writeUInt32LE(centralSize, 12);
	end.writeUInt32LE(offset, 16);
	end.writeUInt16LE(0, 20);

	await writeFile(outputPath, Buffer.concat([...localParts, ...centralParts, end]));
}

const args = parseArgs(process.argv.slice(2));
if (!args.root) {
	console.error("Usage: node build-and-pack.mjs <pluginRoot> [--skip-install] [--no-bump]");
	process.exit(2);
}

try {
	const manifestPath = join(args.root, "plugin.json");
	await access(manifestPath);

	if (!args.noBump) {
		await run(process.execPath, [join(__dirname, "bump-version.mjs"), args.root], args.root);
	}

	if (!args.skipInstall) {
		await run("npm", ["install"], args.root);
	}

	await run("npm", ["run", "build"], args.root);

	const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
	const releaseDir = join(args.root, "release");
	await mkdir(releaseDir, { recursive: true });
	const zipPath = join(releaseDir, `${manifest.id}-${manifest.version}.zip`);

	const packageFiles = [];
	packageFiles.push({ fullPath: manifestPath, archivePath: "plugin.json" });
	const distDir = join(args.root, "dist");
	for (const f of await collectFiles(distDir)) {
		packageFiles.push({ fullPath: f.fullPath, archivePath: join("dist", f.archivePath).replace(/\\/g, "/") });
	}
	for (const style of manifest.styles ?? []) {
		const p = join(args.root, style);
		try {
			await access(p);
			packageFiles.push({ fullPath: p, archivePath: style.replace(/\\/g, "/") });
		} catch {
			// optional
		}
	}
	for (const skillPath of manifest.agent?.skillPaths ?? []) {
		const p = join(args.root, skillPath);
		try {
			for (const f of await collectFiles(p)) {
				packageFiles.push({
					fullPath: f.fullPath,
					archivePath: join(skillPath, f.archivePath).replace(/\\/g, "/"),
				});
			}
		} catch {
			// optional
		}
	}
	try {
		for (const f of await collectFiles(join(args.root, "locales"))) {
			packageFiles.push({
				fullPath: f.fullPath,
				archivePath: join("locales", f.archivePath).replace(/\\/g, "/"),
			});
		}
	} catch {
		// optional
	}

	// de-dupe
	const seen = new Set();
	const unique = [];
	for (const f of packageFiles) {
		if (seen.has(f.archivePath)) continue;
		seen.add(f.archivePath);
		unique.push(f);
	}

	await writeZip(unique, zipPath);
	const st = await stat(zipPath);
	console.log(
		JSON.stringify(
			{
				ok: true,
				zipPath,
				id: manifest.id,
				version: manifest.version,
				bytes: st.size,
				fileCount: unique.length,
			},
			null,
			2,
		),
	);
} catch (err) {
	console.error(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }, null, 2));
	process.exit(1);
}
