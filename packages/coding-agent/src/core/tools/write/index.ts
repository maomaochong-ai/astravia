import { type Static, Type } from "@sinclair/typebox";
import { mkdir as fsMkdir, writeFile as fsWriteFile } from "fs/promises";
import { dirname } from "path";
import type { CodingAgentTool } from "../../session/tool-scope.js";
import { loadToolDescription } from "../description.js";
import { isKnowledgeWikiPath, isProtectedSkillPath, resolveToCwd, resolveWritablePath } from "../path-utils.js";
import { toolCallDescriptionSchema } from "../tool-call-description.js";

const writeSchema = Type.Object({
	description: toolCallDescriptionSchema,
	path: Type.String({
		description: "Path to the file to write (relative or absolute)",
	}),
	content: Type.String({ description: "Content to write to the file" }),
});

export type WriteToolInput = Static<typeof writeSchema>;

/**
 * Pluggable operations for the write tool.
 * Override these to delegate file writing to remote systems (e.g., SSH).
 */
export interface WriteOperations {
	/** Write content to a file */
	writeFile: (absolutePath: string, content: string) => Promise<void>;
	/** Create directory (recursively) */
	mkdir: (dir: string) => Promise<void>;
}

const defaultWriteOperations: WriteOperations = {
	writeFile: (path, content) => fsWriteFile(path, content, "utf-8"),
	mkdir: (dir) => fsMkdir(dir, { recursive: true }).then(() => {}),
};

export interface WriteToolOptions {
	/** Custom operations for file writing. Default: local filesystem */
	operations?: WriteOperations;
}

export function createWriteTool(cwd: string, options?: WriteToolOptions): CodingAgentTool<typeof writeSchema> {
	const ops = options?.operations ?? defaultWriteOperations;
	const fallbackDescription =
		"Write content to a file. Creates the file if it doesn't exist, overwrites if it does. Automatically creates parent directories.";
	const description = loadToolDescription("write", fallbackDescription);

	return {
		name: "write",
		label: "write",
		// 含 kb-processing：加工 agent 可写解析脚本/临时文件。但写入 wiki/ 产物区被下方守卫拦下，
		// 强制 wiki 页一律走 kb_write_page（守封闭 frontmatter schema）。
		scope_use: ["im-claw", "conversation", "project", "batch", "automation", "kb-processing", "cli"],
		category: "core",
		description,
		parameters: writeSchema,
		execute: async (
			_toolCallId: string,
			{ path, content }: { path: string; content: string },
			signal?: AbortSignal,
		) => {
			const requestedPath = resolveToCwd(path, cwd);
			const absolutePath = resolveWritablePath(path, cwd);

			if (isProtectedSkillPath(absolutePath, cwd)) {
				return {
					content: [
						{
							type: "text" as const,
							text:
								`Error: "${absolutePath}" is inside a skill directory which is read-only. ` +
								`Skills are global resources — never write artifacts into them. ` +
								`Write output files to the user's working directory instead.`,
						},
					],
					details: undefined,
				};
			}

			if (isKnowledgeWikiPath(absolutePath)) {
				return {
					content: [
						{
							type: "text" as const,
							text:
								`Error: "${absolutePath}" is inside the knowledge base wiki/ directory, which is managed exclusively by the kb_write_page tool. ` +
								`Never hand-write wiki pages with write — use kb_write_page so each page gets a validated frontmatter schema and a stable id. ` +
								`Scripts, scratch files, and parsed outputs may be written elsewhere (e.g. the working directory).`,
						},
					],
					details: undefined,
				};
			}

			const dir = dirname(absolutePath);
			const pathRetargeted = requestedPath !== absolutePath;
			const notes: string[] = [];
			if (pathRetargeted) {
				notes.push(`[Auto-corrected output path: "${path}" -> "${absolutePath}"]`);
			}

			return new Promise<{ content: Array<{ type: "text"; text: string }>; details: undefined }>(
				(resolve, reject) => {
					// Check if already aborted
					if (signal?.aborted) {
						reject(new Error("Operation aborted"));
						return;
					}

					let aborted = false;

					// Set up abort handler
					const onAbort = () => {
						aborted = true;
						reject(new Error("Operation aborted"));
					};

					if (signal) {
						signal.addEventListener("abort", onAbort, { once: true });
					}

					// Perform the write operation
					(async () => {
						try {
							// Create parent directories if needed
							await ops.mkdir(dir);

							// Check if aborted before writing
							if (aborted) {
								return;
							}

							// Write the file
							await ops.writeFile(absolutePath, content);

							// Check if aborted after writing
							if (aborted) {
								return;
							}

							// Clean up abort handler
							if (signal) {
								signal.removeEventListener("abort", onAbort);
							}

							resolve({
								content: [
									{
										type: "text",
										text:
											`${notes.join("\n")}${notes.length > 0 ? "\n" : ""}` +
											`Successfully wrote ${content.length} bytes to ${absolutePath}`,
									},
								],
								details: undefined,
							});
						} catch (error: any) {
							// Clean up abort handler
							if (signal) {
								signal.removeEventListener("abort", onAbort);
							}

							if (!aborted) {
								reject(error);
							}
						}
					})();
				},
			);
		},
	};
}

/** Default write tool using process.cwd() - for backwards compatibility */
export const writeTool = createWriteTool(process.cwd());
