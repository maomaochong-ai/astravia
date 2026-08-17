import { mkdir, stat, unlink } from "node:fs/promises";
import nodePath from "node:path";
import { type Static, Type } from "@sinclair/typebox";
import type { CodingAgentTool } from "../../session/tool-scope.js";
import { loadToolDescription } from "../description.js";
import { runSubprocess, SubprocessAbortError } from "../exec-subprocess.js";
import { resolveExistingPath, resolveToCwd } from "../path-utils.js";
import { toolCallDescriptionSchema } from "../tool-call-description.js";

const renderPdfPageSchema = Type.Object({
	description: toolCallDescriptionSchema,
	input: Type.String({ description: "Path to the source PDF file." }),
	page: Type.Integer({
		description: "1-based page number to render. Single page only.",
		minimum: 1,
	}),
	output: Type.Optional(
		Type.String({
			description: "Path to write the PNG. Default: <input>.p<page>.png next to the source.",
		}),
	),
	dpi: Type.Optional(
		Type.Integer({
			description: "Render DPI. 72-600. Default 200.",
			minimum: 72,
			maximum: 600,
		}),
	),
});

export type RenderPdfPageToolInput = Static<typeof renderPdfPageSchema>;

const DEFAULT_DPI = 200;
const RENDER_TIMEOUT_MS = 5 * 60 * 1000;

function defaultOutputPath(input: string, page: number): string {
	return `${input}.p${page}.png`;
}

function stripPngExt(p: string): string {
	return p.toLowerCase().endsWith(".png") ? p.slice(0, -4) : p;
}

export function createRenderPdfPageTool(cwd: string): CodingAgentTool<typeof renderPdfPageSchema> {
	const fallback =
		"Render a single PDF page to a PNG image for visual inspection. Follow up with `read` on the returned path.";
	const description = loadToolDescription("render-pdf-page", fallback);

	return {
		name: "render_pdf_page",
		label: "render_pdf_page",
		scope_use: ["im-claw", "conversation", "project", "batch", "automation", "kb-processing", "cli"],
		agent_mode: ["work"],
		category: "doc",
		description,
		parameters: renderPdfPageSchema,
		execute: async (_toolCallId, { input, page, output, dpi }, signal, _onUpdate, ctx) => {
			if (signal?.aborted) throw new Error("Operation aborted");

			ctx?.phase("locate");
			const inputPath = resolveExistingPath(input, cwd);
			const outputPath = resolveToCwd(output ?? defaultOutputPath(inputPath, page), cwd);
			if (!outputPath.toLowerCase().endsWith(".png")) {
				throw new Error(`output must end in .png (got "${outputPath}")`);
			}
			await mkdir(nodePath.dirname(outputPath), { recursive: true });

			const renderDpi = dpi ?? DEFAULT_DPI;
			const prefix = stripPngExt(outputPath);

			ctx?.phase("render");
			const startedAt = Date.now();
			// abort/超时会 killProcessTree 整棵树并抛 SubprocessAbortError，不残留 pdftoppm。
			let render: { code: number | null; stderr: string };
			try {
				render = await runSubprocess(
					"pdftoppm",
					[
						"-png",
						"-r",
						String(renderDpi),
						"-f",
						String(page),
						"-l",
						String(page),
						"-singlefile",
						inputPath,
						prefix,
					],
					{ signal, timeout: RENDER_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 },
				);
			} catch (error) {
				if (error instanceof SubprocessAbortError) {
					await unlink(outputPath).catch(() => {});
					throw new Error("Operation aborted");
				}
				const err = error as NodeJS.ErrnoException;
				const hint =
					err.code === "ENOENT" || err.message.includes("ENOENT")
						? " (pdftoppm not found — install poppler: `brew install poppler` on macOS)"
						: "";
				throw new Error(`pdftoppm failed: ${err.message}${hint}`);
			}
			if (render.code !== 0) {
				throw new Error(`pdftoppm failed: ${render.stderr.trim() || `exited with code ${render.code}`}`);
			}
			if (signal?.aborted) {
				await unlink(outputPath).catch(() => {});
				throw new Error("Operation aborted");
			}

			let sizeBytes: number | undefined;
			try {
				const st = await stat(outputPath);
				sizeBytes = st.size;
			} catch {
				throw new Error(`pdftoppm did not produce expected output at ${outputPath}`);
			}
			const durationMs = Date.now() - startedAt;

			const text = [
				`Rendered page ${page} of ${inputPath} at ${renderDpi} dpi.`,
				`Next step: call read("${outputPath}") to load the image for visual analysis.`,
				"---",
				`dpi=${renderDpi} size_bytes=${sizeBytes ?? "?"} duration_ms=${durationMs}`,
				`output: ${outputPath}`,
			].join("\n");

			return {
				content: [{ type: "text", text }],
				details: undefined,
			};
		},
	};
}

export const renderPdfPageTool = createRenderPdfPageTool(process.cwd());
