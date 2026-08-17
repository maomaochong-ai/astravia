import { type Static, Type } from "@sinclair/typebox";
import { exec as execCb } from "child_process";
import { constants, access as fsAccess } from "fs";
import nodePath from "path";
import { promisify } from "util";
import type { CodingAgentTool } from "../../session/tool-scope.js";
import { loadToolDescription } from "../description.js";
import { resolveExistingPath, resolveToCwd } from "../path-utils.js";
import { toolCallDescriptionSchema } from "../tool-call-description.js";

const execAsync = promisify(execCb);

const docToPdfSchema = Type.Object({
	description: toolCallDescriptionSchema,
	path: Type.String({
		description: "Path to the .doc or .docx file to convert (relative/absolute)",
	}),
	output: Type.Optional(
		Type.String({
			description: "Output PDF path. Defaults to same directory and name with .pdf extension",
		}),
	),
});

export type DocToPdfToolInput = Static<typeof docToPdfSchema>;

const SUPPORTED_EXTENSIONS = new Set([".doc", ".docx"]);

type OfficeBackend = "msoffice" | "wps";

interface DetectedBackend {
	type: OfficeBackend;
	label: string;
}

/**
 * Pluggable operations for the doc-to-pdf tool.
 * Override these to customize detection and conversion behavior.
 */
export interface DocToPdfOperations {
	/** Detect which office backend is available. Returns null if none found. */
	detect: () => Promise<DetectedBackend | null>;
	/** Convert a document to PDF using the specified backend. Returns the output PDF path. */
	convert: (inputPath: string, outputPath: string, backend: DetectedBackend) => Promise<string>;
}

// ── Platform-specific detection ──

async function fileExists(filePath: string): Promise<boolean> {
	return new Promise((resolve) => {
		fsAccess(filePath, constants.F_OK, (err) => resolve(!err));
	});
}

async function commandExists(command: string): Promise<boolean> {
	try {
		await execAsync(`which ${command}`);
		return true;
	} catch {
		return false;
	}
}

async function detectMacOS(): Promise<DetectedBackend | null> {
	// Microsoft Office (Word.app)
	if (await fileExists("/Applications/Microsoft Word.app")) {
		return { type: "msoffice", label: "Microsoft Office (macOS)" };
	}
	// WPS Office
	if (await fileExists("/Applications/wpsoffice.app")) {
		return { type: "wps", label: "WPS Office (macOS)" };
	}
	return null;
}

async function detectWindows(): Promise<DetectedBackend | null> {
	// Microsoft Office - check via PowerShell registry query
	try {
		await execAsync(
			'powershell -Command "Get-ItemProperty HKLM:\\\\SOFTWARE\\\\Microsoft\\\\Office\\\\*\\\\Word -ErrorAction Stop"',
		);
		return { type: "msoffice", label: "Microsoft Office (Windows)" };
	} catch {
		// fallback: check if winword.exe is in PATH
		if (await commandExists("winword")) {
			return { type: "msoffice", label: "Microsoft Office (Windows)" };
		}
	}
	// WPS Office
	try {
		await execAsync(
			'powershell -Command "Get-ItemProperty HKLM:\\\\SOFTWARE\\\\Kingsoft\\\\Office -ErrorAction Stop"',
		);
		return { type: "wps", label: "WPS Office (Windows)" };
	} catch {
		if (await commandExists("wps")) {
			return { type: "wps", label: "WPS Office (Windows)" };
		}
	}
	return null;
}

async function detectLinux(): Promise<DetectedBackend | null> {
	// No MS Office on Linux. Check WPS only.
	if (await commandExists("wps")) {
		return { type: "wps", label: "WPS Office (Linux)" };
	}
	return null;
}

async function detectBackend(): Promise<DetectedBackend | null> {
	switch (process.platform) {
		case "darwin":
			return detectMacOS();
		case "win32":
			return detectWindows();
		case "linux":
			return detectLinux();
		default:
			return null;
	}
}

// ── Platform-specific conversion ──

function escapeAppleScript(str: string): string {
	return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function convertMacOSMSOffice(inputPath: string, outputPath: string): Promise<string> {
	const script = `
tell application "Microsoft Word"
	set wasRunning to running
	open POSIX file "${escapeAppleScript(inputPath)}"
	set theDoc to active document
	save as theDoc file format format PDF file name POSIX file "${escapeAppleScript(outputPath)}"
	close theDoc saving no
	if not wasRunning then quit
end tell`;

	await execAsync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, { timeout: 60000 });
	return outputPath;
}

async function convertMacOSWPS(inputPath: string, outputPath: string): Promise<string> {
	const outputDir = nodePath.dirname(outputPath);
	await execAsync(
		`/Applications/wpsoffice.app/Contents/MacOS/wps --headless --convert-to pdf --outdir "${outputDir}" "${inputPath}"`,
		{ timeout: 60000 },
	);
	return outputPath;
}

async function convertWindowsMSOffice(inputPath: string, outputPath: string): Promise<string> {
	const psScript = `
$word = New-Object -ComObject Word.Application
$word.Visible = $false
try {
	$doc = $word.Documents.Open("${inputPath.replace(/\\/g, "\\\\")}")
	$doc.SaveAs2("${outputPath.replace(/\\/g, "\\\\")}", 17)
	$doc.Close()
} finally {
	$word.Quit()
	[System.Runtime.Interopservices.Marshal]::ReleaseComObject($word) | Out-Null
}`;

	await execAsync(`powershell -Command "${psScript.replace(/"/g, '\\"')}"`, { timeout: 60000 });
	return outputPath;
}

async function convertWindowsWPS(inputPath: string, outputPath: string): Promise<string> {
	const psScript = `
$wps = New-Object -ComObject WPS.Application
$wps.Visible = $false
try {
	$doc = $wps.Documents.Open("${inputPath.replace(/\\/g, "\\\\")}")
	$doc.ExportAsFixedFormat("${outputPath.replace(/\\/g, "\\\\")}", 0)
	$doc.Close()
} finally {
	$wps.Quit()
	[System.Runtime.Interopservices.Marshal]::ReleaseComObject($wps) | Out-Null
}`;

	await execAsync(`powershell -Command "${psScript.replace(/"/g, '\\"')}"`, { timeout: 60000 });
	return outputPath;
}

async function convertLinuxWPS(inputPath: string, outputPath: string): Promise<string> {
	const outputDir = nodePath.dirname(outputPath);
	await execAsync(`wps --headless --convert-to pdf --outdir "${outputDir}" "${inputPath}"`, {
		timeout: 60000,
	});
	return outputPath;
}

async function convertDocument(inputPath: string, outputPath: string, backend: DetectedBackend): Promise<string> {
	const platform = process.platform;

	if (backend.type === "msoffice") {
		if (platform === "darwin") return convertMacOSMSOffice(inputPath, outputPath);
		if (platform === "win32") return convertWindowsMSOffice(inputPath, outputPath);
		throw new Error(`Microsoft Office conversion is not supported on ${platform}`);
	}

	if (backend.type === "wps") {
		if (platform === "darwin") return convertMacOSWPS(inputPath, outputPath);
		if (platform === "win32") return convertWindowsWPS(inputPath, outputPath);
		if (platform === "linux") return convertLinuxWPS(inputPath, outputPath);
		throw new Error(`WPS Office conversion is not supported on ${platform}`);
	}

	throw new Error(`Unknown backend: ${backend.type}`);
}

// ── Default operations ──

const defaultOperations: DocToPdfOperations = {
	detect: detectBackend,
	convert: convertDocument,
};

// ── Tool options ──

export interface DocToPdfToolOptions {
	/** Custom operations for detection and conversion. Default: local system */
	operations?: DocToPdfOperations;
}

// ── Tool factory ──

export function createDocToPdfTool(cwd: string, options?: DocToPdfToolOptions): CodingAgentTool<typeof docToPdfSchema> {
	const ops = options?.operations ?? defaultOperations;
	const fallbackDescription =
		"Convert a .doc or .docx file to PDF using Microsoft Office or WPS Office installed on the system.";
	const description = loadToolDescription("doc-to-pdf", fallbackDescription);

	return {
		name: "doc_to_pdf",
		label: "doc_to_pdf",
		scope_use: ["im-claw", "conversation", "project", "batch", "automation", "kb-processing", "cli"],
		agent_mode: ["work"],
		category: "doc",
		description,
		parameters: docToPdfSchema,
		execute: async (_toolCallId, { path, output }, signal, _onUpdate, ctx) => {
			return new Promise<{ content: Array<{ type: "text"; text: string }>; details: undefined }>(
				(resolve, reject) => {
					if (signal?.aborted) {
						reject(new Error("Operation aborted"));
						return;
					}

					let aborted = false;
					const onAbort = () => {
						aborted = true;
						reject(new Error("Operation aborted"));
					};

					if (signal) {
						signal.addEventListener("abort", onAbort, { once: true });
					}

					(async () => {
						try {
							ctx?.phase("locate");
							// Resolve input path
							const inputPath = resolveExistingPath(path, cwd);
							const ext = nodePath.extname(inputPath).toLowerCase();

							if (!SUPPORTED_EXTENSIONS.has(ext)) {
								resolve({
									content: [
										{
											type: "text",
											text: `Unsupported file type: ${ext}. Only .doc and .docx files are supported.`,
										},
									],
									details: undefined,
								});
								return;
							}

							// Resolve output path
							const outputPath = output ? resolveToCwd(output, cwd) : inputPath.replace(/\.[^.]+$/, ".pdf");

							if (aborted) return;

							ctx?.phase("detect");
							// Detect available backend
							const backend = await ops.detect();
							if (!backend) {
								resolve({
									content: [
										{
											type: "text",
											text: "Dependency missing: no Microsoft Office or WPS Office installation detected. Cannot convert document to PDF. Please try other methods.",
										},
									],
									details: undefined,
								});
								return;
							}

							if (aborted) return;

							ctx?.phase("convert");
							// Perform conversion
							const resultPath = await ops.convert(inputPath, outputPath, backend);

							if (aborted) return;

							if (signal) {
								signal.removeEventListener("abort", onAbort);
							}

							resolve({
								content: [
									{
										type: "text",
										text: `Successfully converted to PDF using ${backend.label}.\nOutput: ${resultPath}`,
									},
								],
								details: undefined,
							});
						} catch (error: unknown) {
							if (signal) {
								signal.removeEventListener("abort", onAbort);
							}

							if (!aborted) {
								const message = error instanceof Error ? error.message : String(error);
								reject(new Error(`Document to PDF conversion failed: ${message}`));
							}
						}
					})();
				},
			);
		},
	};
}

/** Default doc_to_pdf tool using process.cwd() */
export const docToPdfTool = createDocToPdfTool(process.cwd());
