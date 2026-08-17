import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import nodePath from "node:path";
import { getAstraviaHomePath } from "@astravia/action-rpc";
import { type Static, Type } from "@sinclair/typebox";
import type { CodingAgentTool } from "../../session/tool-scope.js";
import { loadToolDescription } from "../description.js";
import { runSubprocess, SubprocessAbortError } from "../exec-subprocess.js";
import { resolveExistingPath, resolveToCwd } from "../path-utils.js";
import { toolCallDescriptionSchema } from "../tool-call-description.js";

const htmlToPdfSchema = Type.Object({
	description: toolCallDescriptionSchema,
	input: Type.String({
		description: "Path to the source HTML file",
	}),
	output: Type.String({
		description: "Required output PDF path",
		minLength: 1,
	}),
	pageSize: Type.Optional(
		Type.Union([Type.Literal("A4")], {
			description: "PDF page size. Defaults to A4",
		}),
	),
	marginTop: Type.Optional(Type.Number({ description: "Top margin in inches" })),
	marginRight: Type.Optional(Type.Number({ description: "Right margin in inches" })),
	marginBottom: Type.Optional(Type.Number({ description: "Bottom margin in inches" })),
	marginLeft: Type.Optional(Type.Number({ description: "Left margin in inches" })),
});

export type HtmlToPdfToolInput = Static<typeof htmlToPdfSchema>;

interface DesktopConfigWithAppPath {
	astraviaAppPath?: string;
}

interface DesktopPdfResponse {
	ok: boolean;
	output?: string;
	renderer?: string;
	error?: {
		code: string;
		message: string;
	};
}

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

function parseDesktopResponse(stdout: string): DesktopPdfResponse {
	const trimmed = stdout.trim();
	if (!trimmed) {
		throw new Error("Astravia Desktop returned empty stdout");
	}
	const parsed = JSON.parse(trimmed) as DesktopPdfResponse;
	if (typeof parsed.ok !== "boolean") {
		throw new Error("Astravia Desktop returned invalid JSON response");
	}
	return parsed;
}

export function createHtmlToPdfTool(cwd: string): CodingAgentTool<typeof htmlToPdfSchema> {
	const fallbackDescription = "Convert an HTML file to PDF by calling Astravia Desktop command-line PDF mode.";
	const description = loadToolDescription("html-to-pdf", fallbackDescription);

	return {
		name: "html_to_pdf",
		label: "html_to_pdf",
		scope_use: ["im-claw", "conversation", "project", "batch", "automation", "kb-processing", "cli"],
		agent_mode: ["work"],
		category: "doc",
		description,
		parameters: htmlToPdfSchema,
		execute: async (
			_toolCallId,
			{ input, output, pageSize, marginTop, marginRight, marginBottom, marginLeft },
			signal,
			_onUpdate,
			ctx,
		) => {
			if (signal?.aborted) {
				throw new Error("Operation aborted");
			}

			ctx?.phase("locate");
			const inputPath = resolveExistingPath(input, cwd);
			const outputPath = resolveToCwd(output, cwd);
			const astravia = await findAstraviaExecutable();
			const args = ["--html-to-pdf", inputPath, "--output", outputPath];
			if (pageSize) args.push("--page-size", pageSize);
			if (marginTop !== undefined) args.push("--margin-top", String(marginTop));
			if (marginRight !== undefined) args.push("--margin-right", String(marginRight));
			if (marginBottom !== undefined) args.push("--margin-bottom", String(marginBottom));
			if (marginLeft !== undefined) args.push("--margin-left", String(marginLeft));

			ctx?.phase("render");
			// 非零退出码也正常返回 stdout（Astravia CLI 把错误 JSON 写在 stdout）；
			// abort/超时会 killProcessTree 整棵树并抛 SubprocessAbortError，不残留进程。
			let stdout: string;
			let stderr: string;
			try {
				const result = await runSubprocess(astravia.path, args, { signal, timeout: 120000 });
				stdout = result.stdout;
				stderr = result.stderr;
			} catch (error) {
				if (error instanceof SubprocessAbortError) throw new Error("Operation aborted");
				throw error;
			}
			if (signal?.aborted) {
				throw new Error("Operation aborted");
			}
			const response = parseDesktopResponse(stdout);
			if (!response.ok) {
				const message = response.error?.message ?? (stderr.trim() || "Unknown PDF generation error");
				throw new Error(`Astravia Desktop PDF generation failed: ${message}`);
			}
			if (!response.output) {
				throw new Error("Astravia Desktop did not return an output path");
			}
			const staleNote = astravia.staleConfiguredPath
				? `\nNote: configured astraviaAppPath was stale and fallback path was used: ${astravia.staleConfiguredPath}`
				: "";
			return {
				content: [
					{
						type: "text",
						text: `Successfully converted HTML to PDF.\nOutput: ${response.output}\nRenderer: ${response.renderer ?? "electron"}${staleNote}`,
					},
				],
				details: undefined,
			};
		},
	};
}

export const htmlToPdfTool = createHtmlToPdfTool(process.cwd());
