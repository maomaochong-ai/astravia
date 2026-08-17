import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import nodePath from "node:path";
import { getAstraviaHomePath } from "@astravia/action-rpc";
import { type Static, Type } from "@sinclair/typebox";
import type { CodingAgentTool } from "../../session/tool-scope.js";
import { loadToolDescription } from "../description.js";
import { runSubprocess } from "../exec-subprocess.js";
import { runWithOcrLimit } from "../ocr-concurrency.js";
import { resolveExistingPath, resolveToCwd } from "../path-utils.js";
import { toolCallDescriptionSchema } from "../tool-call-description.js";

const extractTextFromImgSchema = Type.Object({
	description: toolCallDescriptionSchema,
	input: Type.String({
		description: "Path to the source image file (.png .jpg .jpeg .webp .bmp .gif).",
	}),
	output: Type.Optional(
		Type.String({
			description: "Path to write the structured JSON. Default: <input>.ocr.json next to the source.",
		}),
	),
	maxChars: Type.Optional(
		Type.Integer({
			description: "Cap on returned text length. Default 8000. Full text is still written to <output>.",
			minimum: 0,
		}),
	),
});

export type ExtractTextFromImgToolInput = Static<typeof extractTextFromImgSchema>;

interface DesktopConfigWithAppPath {
	astraviaAppPath?: string;
}

interface OcrCliResponse {
	ok: boolean;
	output?: string;
	totalPages?: number;
	processedPages?: number;
	engine?: string;
	durationMs?: number;
	error?: { code: string; message: string };
}

interface OcrPageResult {
	page: number;
	text: string;
	source: "text-layer" | "ocr";
	width: number;
	height: number;
	ocrDurationMs?: number;
	confidence?: number;
}

interface OcrJsonDocument {
	version: number;
	meta: Record<string, unknown>;
	pages: OcrPageResult[];
}

const DEFAULT_MAX_CHARS = 8000;
// 5 minutes is plenty for a single image; even huge scans (~10000 px wide)
// finish in tens of seconds plus model warm-up.
const OCR_TIMEOUT_MS = 5 * 60 * 1000;

const SUPPORTED_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"]);

function configPath(): string {
	return nodePath.join(getAstraviaHomePath(), "desktop-config.json");
}

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await access(filePath, constants.X_OK);
		return true;
	} catch {
		try {
			await access(filePath, constants.F_OK);
			return true;
		} catch {
			return false;
		}
	}
}

async function readConfiguredAstraviaAppPath(): Promise<string | undefined> {
	try {
		const raw = await readFile(configPath(), "utf8");
		const parsed = JSON.parse(raw) as DesktopConfigWithAppPath;
		return typeof parsed.astraviaAppPath === "string" && parsed.astraviaAppPath.length > 0
			? parsed.astraviaAppPath
			: undefined;
	} catch {
		return undefined;
	}
}

async function findAstraviaExecutable(): Promise<{ path: string; staleConfiguredPath?: string }> {
	const envPath = process.env.ASTRAVIA_DESKTOP_EXE;
	if (envPath && (await fileExists(envPath))) {
		return { path: envPath };
	}

	const configuredPath = await readConfiguredAstraviaAppPath();
	if (configuredPath && (await fileExists(configuredPath))) {
		return { path: configuredPath };
	}

	const candidates =
		process.platform === "win32"
			? [
					nodePath.join(process.env.LOCALAPPDATA ?? "", "Programs", "Astravia", "Astravia.exe"),
					nodePath.join(process.env.ProgramFiles ?? "C:\\Program Files", "Astravia", "Astravia.exe"),
				]
			: ["/Applications/Astravia.app/Contents/MacOS/Astravia", "/usr/local/bin/astravia-desktop"];

	for (const candidate of candidates) {
		if (candidate && (await fileExists(candidate))) {
			return { path: candidate, staleConfiguredPath: configuredPath };
		}
	}

	const staleNote = configuredPath ? ` Configured astraviaAppPath is stale: ${configuredPath}` : "";
	throw new Error(
		`Astravia Desktop executable not found. Set ASTRAVIA_DESKTOP_EXE or start Astravia Desktop once to write astraviaAppPath.${staleNote}`,
	);
}

function parseDesktopResponse(stdout: string): OcrCliResponse {
	const lines = stdout.split(/\r?\n/).filter((l) => l.trim().length > 0);
	for (let i = lines.length - 1; i >= 0; i--) {
		try {
			const parsed = JSON.parse(lines[i]) as OcrCliResponse;
			if (typeof parsed.ok === "boolean") return parsed;
		} catch {
			// keep walking back
		}
	}
	throw new Error("Astravia Desktop returned no parseable JSON on stdout");
}

function defaultOutputPath(input: string): string {
	return `${input}.ocr.json`;
}

function buildAgentText(doc: OcrJsonDocument, maxChars: number, outputPath: string): string {
	const page = doc.pages[0];
	const fullText = (page?.text ?? "").trim();
	const truncated = maxChars > 0 && fullText.length > maxChars;
	const body = truncated
		? `${fullText.slice(0, maxChars)}\n…[truncated ${fullText.length - maxChars} chars]`
		: fullText;

	const meta = doc.meta as { durationMs?: number; engine?: string };
	const footer = [
		"---",
		`confidence=${page?.confidence ?? "?"} duration_ms=${meta.durationMs ?? "?"} engine=${meta.engine ?? "?"}`,
		`output: ${outputPath}`,
	].join("\n");

	return `${body}\n${footer}`;
}

export function createExtractTextFromImgTool(cwd: string): CodingAgentTool<typeof extractTextFromImgSchema> {
	const fallback = "Extract text from a single image via Astravia Desktop's local PP-OCRv5 runner.";
	const description = loadToolDescription("extract-text-from-img", fallback);

	return {
		name: "extract_text_from_img",
		label: "extract_text_from_img",
		scope_use: ["im-claw", "conversation", "project", "batch", "automation", "kb-processing", "cli"],
		agent_mode: ["work"],
		category: "doc",
		description,
		parameters: extractTextFromImgSchema,
		execute: async (_toolCallId, { input, output, maxChars }, signal, _onUpdate, ctx) => {
			if (signal?.aborted) throw new Error("Operation aborted");

			ctx?.phase("locate");
			const inputPath = resolveExistingPath(input, cwd);
			const ext = nodePath.extname(inputPath).toLowerCase();
			if (!SUPPORTED_EXTS.has(ext)) {
				throw new Error(
					`Unsupported image extension "${ext || "<none>"}". Supported: ${[...SUPPORTED_EXTS].join(", ")}`,
				);
			}
			const outputPath = resolveToCwd(output ?? defaultOutputPath(inputPath), cwd);
			const astravia = await findAstraviaExecutable();

			const args = ["--ocr-img", inputPath, "--output", outputPath];

			ctx?.phase("ocr");
			// 全局 OCR 并发闸：限制同时存在的本地 Astravia OCR 子进程数，保护 CPU。
			const { stdout, stderr } = await runWithOcrLimit(async () => {
				// 已拿到并发额度后再 spawn；若此刻已 abort 则立即短路，不占额度空跑 OCR。
				if (signal?.aborted) throw new Error("Operation aborted");
				// 非零退出码也正常返回 stdout/stderr（Astravia CLI 把错误 JSON 写在 stdout，
				// 交给下方 parseDesktopResponse 处理）；abort/超时会 killProcessTree 整棵树并抛错。
				const result = await runSubprocess(astravia.path, args, {
					signal,
					timeout: OCR_TIMEOUT_MS,
					maxBuffer: 32 * 1024 * 1024,
				});
				return { stdout: result.stdout, stderr: result.stderr };
			});
			if (signal?.aborted) throw new Error("Operation aborted");

			const response = parseDesktopResponse(stdout);
			if (!response.ok) {
				const message = response.error?.message ?? (stderr.trim() || "Unknown OCR error");
				throw new Error(`Astravia Desktop OCR failed: ${message}`);
			}
			if (!response.output) {
				throw new Error("Astravia Desktop did not return an output path");
			}

			ctx?.phase("read");
			const docRaw = await readFile(response.output, "utf8");
			const doc = JSON.parse(docRaw) as OcrJsonDocument;
			const cap = maxChars ?? DEFAULT_MAX_CHARS;
			const text = buildAgentText(doc, cap, response.output);
			const staleNote = astravia.staleConfiguredPath
				? `\nNote: configured astraviaAppPath was stale and a fallback path was used: ${astravia.staleConfiguredPath}`
				: "";
			return {
				content: [{ type: "text", text: `${text}${staleNote}` }],
				details: undefined,
			};
		},
	};
}

export const extractTextFromImgTool = createExtractTextFromImgTool(process.cwd());
