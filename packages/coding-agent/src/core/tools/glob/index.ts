import { type Static, Type } from "@sinclair/typebox";
import { existsSync, readFileSync, statSync } from "fs";
import { glob } from "glob";
import ignore from "ignore";
import path from "path";
import type { CodingAgentTool } from "../../session/tool-scope.js";
import { loadToolDescription } from "../description.js";
import { resolveExistingPath } from "../path-utils.js";
import { toolCallDescriptionSchema } from "../tool-call-description.js";
import { DEFAULT_MAX_BYTES, formatSize, type TruncationResult, truncateHead } from "../truncate.js";

const globSchema = Type.Object({
	description: toolCallDescriptionSchema,
	pattern: Type.String({
		description:
			"Glob pattern to match files and directories, e.g. '**/*.ts', 'src/**/*.spec.ts', 'src/**', or 'package*.json'",
	}),
	path: Type.Optional(Type.String({ description: "Directory to search in (default: current directory)" })),
	limit: Type.Optional(Type.Number({ description: "Maximum number of results (default: 100)" })),
});

export type GlobToolInput = Static<typeof globSchema>;

const DEFAULT_LIMIT = 100;

export interface GlobToolDetails {
	durationMs: number;
	numFiles: number;
	truncation?: TruncationResult;
	resultLimitReached?: number;
}

export interface GlobOperations {
	/** Check if path exists and is a directory. Throws if path doesn't exist. */
	isDirectory: (absolutePath: string) => Promise<boolean> | boolean;
	/** Find files and directories matching glob pattern. Returns absolute or search-directory-relative paths. */
	glob: (
		pattern: string,
		cwd: string,
		options: { limit: number; signal?: AbortSignal },
	) => Promise<string[]> | string[];
}

const defaultGlobOperations: Pick<GlobOperations, "isDirectory"> = {
	isDirectory: (absolutePath) => statSync(absolutePath).isDirectory(),
};

export interface GlobToolOptions {
	/** Custom operations for glob. Default: local filesystem + node glob */
	operations?: GlobOperations;
}

function extractGlobBaseDirectory(patternValue: string): { baseDir: string | undefined; relativePattern: string } {
	const firstGlobChar = patternValue.search(/[*?[{]/);
	if (firstGlobChar === -1) {
		return {
			baseDir: path.dirname(patternValue),
			relativePattern: path.basename(patternValue),
		};
	}

	const staticPrefix = patternValue.slice(0, firstGlobChar);
	const lastSlash = Math.max(staticPrefix.lastIndexOf("/"), staticPrefix.lastIndexOf("\\"));
	if (lastSlash === -1) {
		return { baseDir: undefined, relativePattern: patternValue };
	}

	let baseDir = staticPrefix.slice(0, lastSlash);
	if (baseDir === "" && lastSlash === 0) {
		baseDir = path.parse(patternValue).root || path.sep;
	}
	if (process.platform === "win32" && /^[A-Za-z]:$/.test(baseDir)) {
		baseDir += path.sep;
	}

	return {
		baseDir,
		relativePattern: patternValue.slice(lastSlash + 1),
	};
}

function normalizeOutputPath(filePath: string, searchPath: string): string {
	const hadTrailingSlash = filePath.endsWith("/") || filePath.endsWith("\\");
	const absolute = path.isAbsolute(filePath) ? filePath : path.join(searchPath, filePath);
	const relative = path.relative(searchPath, absolute);
	const normalized = (relative || path.basename(absolute)).replace(/\\/g, "/");
	return hadTrailingSlash && !normalized.endsWith("/") ? `${normalized}/` : normalized;
}

interface IgnoreMatcher {
	basePath: string;
	ignores: ReturnType<typeof ignore>;
}

function normalizeForIgnore(filePath: string): string {
	return filePath
		.replace(/\\/g, "/")
		.replace(/^\.\/+/, "")
		.replace(/^\/+/, "");
}

function loadGitignoreMatchers(searchPath: string): IgnoreMatcher[] {
	const matchers: IgnoreMatcher[] = [];
	const gitignorePaths = glob.sync("**/.gitignore", {
		cwd: searchPath,
		dot: true,
		absolute: true,
		ignore: ["**/.git/**"],
		windowsPathsNoEscape: true,
	});

	const rootGitignore = path.join(searchPath, ".gitignore");
	if (existsSync(rootGitignore) && !gitignorePaths.includes(rootGitignore)) {
		gitignorePaths.push(rootGitignore);
	}

	for (const gitignorePath of gitignorePaths) {
		const content = readFileSync(gitignorePath, "utf8");
		const basePath = path.dirname(gitignorePath);
		const ignores = ignore().add(content);
		matchers.push({ basePath, ignores });
	}

	return matchers.sort((a, b) => a.basePath.length - b.basePath.length);
}

function isIgnoredByGitignore(filePath: string, searchPath: string, matchers: IgnoreMatcher[]): boolean {
	const hadTrailingSlash = filePath.endsWith("/") || filePath.endsWith("\\");
	const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(searchPath, filePath);
	let ignored = false;

	for (const matcher of matchers) {
		const relativeToIgnoreFile = path.relative(matcher.basePath, absolutePath);
		if (!relativeToIgnoreFile || relativeToIgnoreFile.startsWith("..") || path.isAbsolute(relativeToIgnoreFile)) {
			continue;
		}

		let normalized = normalizeForIgnore(relativeToIgnoreFile);
		if (hadTrailingSlash && !normalized.endsWith("/")) {
			normalized += "/";
		}
		if (!normalized) {
			continue;
		}

		const result = matcher.ignores.test(normalized);
		if (result.ignored) {
			ignored = true;
		} else if (result.unignored) {
			ignored = false;
		}
	}

	return ignored;
}

async function runNodeGlob(
	patternValue: string,
	searchPath: string,
	limit: number,
	signal?: AbortSignal,
): Promise<string[]> {
	if (signal?.aborted) {
		throw new Error("Operation aborted");
	}

	const gitignoreMatchers = loadGitignoreMatchers(searchPath);
	const results: string[] = [];

	for await (const entry of glob.iterate(patternValue, {
		cwd: searchPath,
		dot: true,
		mark: true,
		posix: true,
		signal,
		windowsPathsNoEscape: true,
		ignore: ["**/.git/**"],
	})) {
		if (isIgnoredByGitignore(entry, searchPath, gitignoreMatchers)) {
			continue;
		}

		results.push(entry);
		if (results.length >= limit) break;
	}

	return results;
}

export function createGlobTool(cwd: string, options?: GlobToolOptions): CodingAgentTool<typeof globSchema> {
	const customOps = options?.operations;
	const fallbackDescription = `Fast file and directory pattern matching by glob pattern. Returns matching paths relative to the search directory. Respects .gitignore. Output is truncated to ${DEFAULT_LIMIT} results or ${DEFAULT_MAX_BYTES / 1024}KB (whichever is hit first).`;
	const description = loadToolDescription("glob", fallbackDescription);

	return {
		name: "glob",
		label: "glob",
		scope_use: ["im-claw", "conversation", "project", "batch", "automation", "kb-processing", "cli"],
		category: "core",
		description,
		parameters: globSchema,
		execute: async (
			_toolCallId: string,
			{ pattern: patternValue, path: searchDir, limit }: { pattern: string; path?: string; limit?: number },
			signal?: AbortSignal,
		) => {
			const start = Date.now();
			let searchPath = resolveExistingPath(searchDir || ".", cwd);
			let effectivePattern = patternValue;

			if (path.isAbsolute(patternValue)) {
				const { baseDir, relativePattern } = extractGlobBaseDirectory(patternValue);
				if (baseDir) {
					searchPath = resolveExistingPath(baseDir, cwd);
					effectivePattern = relativePattern;
				}
			}

			const ops = customOps ?? defaultGlobOperations;
			let isDirectory: boolean;
			try {
				isDirectory = await ops.isDirectory(searchPath);
			} catch {
				throw new Error(`Path not found: ${searchPath}`);
			}
			if (!isDirectory) {
				throw new Error(`Not a directory: ${searchPath}`);
			}

			const effectiveLimit = Math.max(1, limit ?? DEFAULT_LIMIT);
			const rawResults = customOps
				? await customOps.glob(effectivePattern, searchPath, { limit: effectiveLimit, signal })
				: await runNodeGlob(effectivePattern, searchPath, effectiveLimit, signal);

			const normalized = rawResults.map((filePath) => normalizeOutputPath(filePath, searchPath));
			const uniqueResults = Array.from(new Set(normalized));
			const limitedResults = uniqueResults.slice(0, effectiveLimit);
			const resultLimitReached = uniqueResults.length >= effectiveLimit;
			const rawOutput = limitedResults.join("\n");
			const truncation = truncateHead(rawOutput, { maxLines: Number.MAX_SAFE_INTEGER });
			const details: GlobToolDetails = {
				durationMs: Date.now() - start,
				numFiles: limitedResults.length,
			};

			if (limitedResults.length === 0) {
				return {
					content: [{ type: "text", text: "No files or directories found matching pattern" }],
					details,
				};
			}

			let output = truncation.content;
			const notices: string[] = [];

			if (resultLimitReached) {
				notices.push(
					`${effectiveLimit} results limit reached. Use limit=${effectiveLimit * 2} for more, or refine pattern`,
				);
				details.resultLimitReached = effectiveLimit;
			}

			if (truncation.truncated) {
				notices.push(`${formatSize(DEFAULT_MAX_BYTES)} limit reached`);
				details.truncation = truncation;
			}

			if (notices.length > 0) {
				output += `\n\n[${notices.join(". ")}]`;
			}

			return {
				content: [{ type: "text", text: output }],
				details,
			};
		},
	};
}

/** Default glob tool using process.cwd() - for backwards compatibility */
export const globTool = createGlobTool(process.cwd());
