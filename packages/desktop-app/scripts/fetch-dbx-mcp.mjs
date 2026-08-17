// Download the dbx-mcp native binary for Astravia's database integration (P7).
//
// Source: Astravia's own build published as a GitHub Release on the fork
// (https://github.com/sikongyue/dbx, upstream: https://github.com/t8y2/dbx).
// The release asset `dbx-mcp-<version>-astravia-win-x64.exe` is built by
// Astravia's own CI (fork `.github/workflows/dbx-mcp-astravia.yml`) and is the
// binary Astravia registers as a built-in STDIO MCP server.
//
// Idempotent: skips when the target already exists and its SHA-256 matches the
// pinned digest. Version is locked on purpose (see docs/dbx-main-integration-tasks.md);
// upgrade = pull fork upstream -> review -> CI build -> update VERSION +
// EXPECTED_SHA256, then re-run.
//
// Override via env when needed:
//   DBX_MCP_VERSION=v0.4.61
//   DBX_MCP_SHA256=...
//   DBX_MCP_RELEASE=https://github.com/sikongyue/dbx/releases/download/dbx-mcp-astravia-v0.4.61

import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { copyFile, mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const projectRoot = join(import.meta.dirname, "..");
const PLATFORM = "win32-x64";
const ASSET_PLATFORM = "win-x64"; // fork CI artifact naming, distinct from resources dir "win32-x64"
const VERSION = process.env.DBX_MCP_VERSION ?? "0.4.61";
const EXPECTED_SHA256 = (
	process.env.DBX_MCP_SHA256 ??
	"78957987da28600bedede19d3d731b756333f8d4f64bd3d553e0407413bd7ca8"
).toLowerCase();
const RELEASE =
	process.env.DBX_MCP_RELEASE ??
	`https://github.com/sikongyue/dbx/releases/download/dbx-mcp-astravia-v${VERSION}`;

const targetExe = join(projectRoot, "resources/dbx-mcp", PLATFORM, "dbx-mcp.exe");
const assetName = `dbx-mcp-${VERSION}-astravia-${ASSET_PLATFORM}.exe`;
const assetUrl = `${RELEASE}/${assetName}`;

function sha256File(path) {
	const data = readFile(path);
	return data.then((buf) => createHash("sha256").update(buf).digest("hex"));
}

async function fileExists(path) {
	try {
		const s = await stat(path);
		return s.isFile() && s.size > 0;
	} catch {
		return false;
	}
}

async function download(url, dest) {
	console.log(`[dbx-mcp] fetching: ${url}`);
	const res = await fetch(url, { redirect: "follow" });
	if (!res.ok || !res.body) {
		throw new Error(`Failed to download ${url}: HTTP ${res.status}`);
	}
	await mkdir(dirname(dest), { recursive: true });
	const tmp = `${dest}.part`;
	const ws = createWriteStream(tmp);
	await pipeline(Readable.fromWeb(res.body), ws);
	await rename(tmp, dest);
}

async function main() {
	// 1. Skip if the target already exists with a matching digest.
	if (await fileExists(targetExe)) {
		const existing = await sha256File(targetExe);
		if (existing === EXPECTED_SHA256) {
			console.log(`[dbx-mcp] cached: ${targetExe}`);
			return;
		}
		console.log(`[dbx-mcp] digest mismatch (${existing}), re-fetching`);
	}

	// 2. Download the Astravia-built exe directly from the fork Release.
	const tmp = join(tmpdir(), assetName);
	await download(assetUrl, tmp);
	const actual = await sha256File(tmp);
	if (actual !== EXPECTED_SHA256) {
		throw new Error(`SHA-256 mismatch: expected ${EXPECTED_SHA256}, got ${actual}`);
	}

	// 3. Install into resources/dbx-mcp/<platform>/.
	await mkdir(dirname(targetExe), { recursive: true });
	// copyFile (not rename): tmpdir and project may be on different drives (EXDEV).
	await copyFile(tmp, targetExe);

	// 4. Cleanup.
	await rm(tmp, { force: true });

	const s = await stat(targetExe);
	console.log(
		`[dbx-mcp] ready: ${targetExe} (${(s.size / 1024 / 1024).toFixed(1)} MB, v${VERSION}, Astravia build)`
	);
}

main().catch((err) => {
	console.error("[dbx-mcp] failed:", err);
	process.exit(1);
});
