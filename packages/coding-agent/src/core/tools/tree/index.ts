import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { type Static, Type } from "@sinclair/typebox";
import { ensureTool } from "../../../utils/tools-manager.js";
import type { CodingAgentTool } from "../../session/tool-scope.js";
import { loadToolDescription } from "../description.js";
import { resolveExistingPath } from "../path-utils.js";
import { toolCallDescriptionSchema } from "../tool-call-description.js";
import { DEFAULT_MAX_BYTES, formatSize, type TruncationResult, truncateHead } from "../truncate.js";

const treeSchema = Type.Object({
	description: toolCallDescriptionSchema,
	path: Type.Optional(
		Type.String({
			description: "Root directory to inspect (default: current directory)",
		}),
	),
	maxDepth: Type.Optional(Type.Number({ description: "Maximum depth to render (default: 4)" })),
	limit: Type.Optional(Type.Number({ description: "Maximum number of nodes to render (default: 1000)" })),
	includeFiles: Type.Optional(Type.Boolean({ description: "Include files in tree output (default: true)" })),
	includeHidden: Type.Optional(Type.Boolean({ description: "Include hidden files and directories (default: false)" })),
	ignore: Type.Optional(
		Type.Array(Type.String({ description: "Additional fd --exclude glob pattern" }), {
			description: "Extra ignore patterns (appended to .gitignore rules)",
		}),
	),
});

export type TreeToolInput = Static<typeof treeSchema>;

const DEFAULT_MAX_DEPTH = 4;
const DEFAULT_LIMIT = 1000;

type NodeType = "dir" | "file";

interface TreeNode {
	name: string;
	type: NodeType;
	children: Map<string, TreeNode>;
}

export interface TreeToolDetails {
	truncation?: TruncationResult;
	nodeLimitReached?: number;
	scanLimitReached?: number;
	totalNodesDiscovered: number;
	nodesRendered: number;
}

export interface TreeOperations {
	exists: (absolutePath: string) => Promise<boolean> | boolean;
	stat: (absolutePath: string) => Promise<{ isDirectory: () => boolean }> | { isDirectory: () => boolean };
	ensureFd: () => Promise<string | undefined>;
	runFd: (fdPath: string, args: string[]) => Promise<{ status: number | null; stdout: string; stderr: string }>;
}

const defaultTreeOperations: TreeOperations = {
	exists: existsSync,
	stat: statSync,
	ensureFd: async () => ensureTool("fd", true),
	runFd: async (fdPath, args) => {
		const result = spawnSync(fdPath, args, {
			encoding: "utf-8",
			maxBuffer: 20 * 1024 * 1024,
		});
		return {
			status: result.status,
			stdout: result.stdout ?? "",
			stderr: result.stderr ?? "",
		};
	},
};

export interface TreeToolOptions {
	operations?: TreeOperations;
}

function createNode(name: string, type: NodeType): TreeNode {
	return { name, type, children: new Map() };
}

function normalizeFdLine(rawLine: string, basePath: string): string | null {
	const trimmed = rawLine.replace(/\r$/, "").trim();
	if (!trimmed) return null;

	let normalized = trimmed;
	if (path.isAbsolute(normalized)) {
		normalized = path.relative(basePath, normalized);
	} else if (normalized.startsWith(basePath)) {
		normalized = path.relative(basePath, normalized);
	}

	normalized = normalized.replace(/\\/g, "/");
	normalized = normalized.replace(/^\.\/+/, "");
	normalized = normalized.replace(/^\/+/, "");
	normalized = normalized.replace(/\/+$/, "");

	if (!normalized || normalized === ".") return null;
	if (normalized === ".." || normalized.startsWith("../")) return null;
	return normalized;
}

function addPath(root: TreeNode, relativePath: string, leafType: NodeType): void {
	const segments = relativePath.split("/").filter(Boolean);
	if (segments.length === 0) return;

	let current = root;
	for (let i = 0; i < segments.length; i++) {
		const segment = segments[i];
		const isLeaf = i === segments.length - 1;
		const nextType: NodeType = isLeaf ? leafType : "dir";

		const existing = current.children.get(segment);
		if (!existing) {
			const created = createNode(segment, nextType);
			current.children.set(segment, created);
			current = created;
			continue;
		}

		if (existing.type === "file" && nextType === "dir") {
			existing.type = "dir";
		}
		current = existing;
	}
}

function countImmediateChildren(node: TreeNode): { dirCount: number; fileCount: number } {
	let dirCount = 0;
	let fileCount = 0;
	for (const child of node.children.values()) {
		if (child.type === "dir") dirCount++;
		else fileCount++;
	}
	return { dirCount, fileCount };
}

function formatNodeLine(node: TreeNode): string {
	if (node.type === "file") return `[F] ${node.name}`;
	const { dirCount, fileCount } = countImmediateChildren(node);
	return `[D] ${node.name} (d:${dirCount}, f:${fileCount})`;
}

function sortChildren(children: Iterable<TreeNode>): TreeNode[] {
	return Array.from(children).sort((a, b) => {
		if (a.type !== b.type) {
			return a.type === "dir" ? -1 : 1;
		}
		return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
	});
}

interface RenderedTreeLine {
	line: string;
	relativePath: string;
	type: NodeType;
}

function renderTree(
	root: TreeNode,
	maxDepth: number,
	limit: number,
): { lines: RenderedTreeLine[]; nodeLimitReached: boolean } {
	const lines: RenderedTreeLine[] = [];
	let nodeLimitReached = false;

	const tryPush = (line: RenderedTreeLine): boolean => {
		if (lines.length >= limit) {
			nodeLimitReached = true;
			return false;
		}
		lines.push(line);
		return true;
	};

	if (
		!tryPush({
			line: formatNodeLine(root),
			relativePath: ".",
			type: "dir",
		})
	) {
		return { lines, nodeLimitReached };
	}

	const walk = (node: TreeNode, relativePath: string, prefix: string, depth: number): boolean => {
		if (depth >= maxDepth) return false;
		const children = sortChildren(node.children.values());
		for (let i = 0; i < children.length; i++) {
			const child = children[i];
			const isLast = i === children.length - 1;
			const branch = `${prefix}${isLast ? "└── " : "├── "}`;
			const childRelativePath = relativePath === "." ? child.name : `${relativePath}/${child.name}`;
			if (
				!tryPush({
					line: `${branch}${formatNodeLine(child)}`,
					relativePath: childRelativePath,
					type: child.type,
				})
			) {
				return true;
			}
			if (child.type === "dir") {
				const childPrefix = `${prefix}${isLast ? "    " : "│   "}`;
				const shouldStop = walk(child, childRelativePath, childPrefix, depth + 1);
				if (shouldStop) return true;
			}
		}
		return false;
	};

	walk(root, ".", "", 0);
	return { lines, nodeLimitReached };
}

function buildFdArgs(
	searchPath: string,
	maxDepth: number,
	scanLimit: number,
	includeHidden: boolean,
	ignore: string[],
): string[] {
	const args: string[] = [
		"--color=never",
		"--type",
		"d",
		"--max-depth",
		String(maxDepth),
		"--max-results",
		String(scanLimit),
	];
	if (includeHidden) args.push("--hidden");
	for (const pattern of ignore) {
		args.push("--exclude", pattern);
	}
	args.push(".", searchPath);
	return args;
}

function buildFileFdArgs(
	searchPath: string,
	maxDepth: number,
	scanLimit: number,
	includeHidden: boolean,
	ignore: string[],
): string[] {
	const args: string[] = [
		"--color=never",
		"--type",
		"f",
		"--max-depth",
		String(maxDepth),
		"--max-results",
		String(scanLimit),
	];
	if (includeHidden) args.push("--hidden");
	for (const pattern of ignore) {
		args.push("--exclude", pattern);
	}
	args.push(".", searchPath);
	return args;
}

function parseFdOutput(stdout: string, searchPath: string): string[] {
	const paths: string[] = [];
	for (const line of stdout.split("\n")) {
		const normalized = normalizeFdLine(line, searchPath);
		if (normalized) paths.push(normalized);
	}
	return paths;
}

export function createTreeTool(cwd: string, options?: TreeToolOptions): CodingAgentTool<typeof treeSchema> {
	const ops = options?.operations ?? defaultTreeOperations;
	const fallbackDescription = `Render a compact directory tree with explicit node types ([D]/[F]) and per-directory child counts. Use this first to understand project structure with minimal tokens. Tool name is dir_tree (not shell tree). Respects .gitignore, supports depth limiting, and truncates output to ${DEFAULT_LIMIT} nodes or ${DEFAULT_MAX_BYTES / 1024}KB.`;
	const description = loadToolDescription("tree", fallbackDescription);

	return {
		name: "dir_tree",
		label: "dir_tree",
		scope_use: ["im-claw", "conversation", "project", "batch", "automation", "kb-processing", "cli"],
		category: "core",
		description,
		parameters: treeSchema,
		execute: async (_toolCallId: string, input: TreeToolInput, signal?: AbortSignal) => {
			if (signal?.aborted) {
				throw new Error("Operation aborted");
			}

			const searchPath = resolveExistingPath(input.path || ".", cwd);
			const effectiveMaxDepth = Math.max(0, Math.floor(input.maxDepth ?? DEFAULT_MAX_DEPTH));
			const effectiveLimit = Math.max(1, Math.floor(input.limit ?? DEFAULT_LIMIT));
			const includeFiles = input.includeFiles ?? true;
			const includeHidden = input.includeHidden ?? false;
			const ignore = (input.ignore ?? []).filter((pattern) => pattern.trim().length > 0);
			const scanLimit = Math.max(effectiveLimit * 4, 2000);

			if (!(await ops.exists(searchPath))) {
				throw new Error(`Path not found: ${searchPath}`);
			}
			const stats = await ops.stat(searchPath);
			if (!stats.isDirectory()) {
				throw new Error(`Not a directory: ${searchPath}`);
			}

			const fdPath = await ops.ensureFd();
			if (!fdPath) {
				throw new Error("fd is not available and could not be downloaded");
			}

			const dirResult = await ops.runFd(
				fdPath,
				buildFdArgs(searchPath, effectiveMaxDepth, scanLimit, includeHidden, ignore),
			);
			if (dirResult.status !== 0) {
				const error = dirResult.stderr.trim() || `fd exited with code ${dirResult.status}`;
				throw new Error(`Failed to build directory tree: ${error}`);
			}

			let filePaths: string[] = [];
			if (includeFiles) {
				const fileResult = await ops.runFd(
					fdPath,
					buildFileFdArgs(searchPath, effectiveMaxDepth, scanLimit, includeHidden, ignore),
				);
				if (fileResult.status !== 0) {
					const error = fileResult.stderr.trim() || `fd exited with code ${fileResult.status}`;
					throw new Error(`Failed to build directory tree: ${error}`);
				}
				filePaths = parseFdOutput(fileResult.stdout, searchPath);
			}

			const dirPaths = parseFdOutput(dirResult.stdout, searchPath);
			const rootLabel = path.basename(searchPath) || searchPath;
			const root = createNode(rootLabel, "dir");

			for (const dirPath of dirPaths) {
				addPath(root, dirPath, "dir");
			}
			for (const filePath of filePaths) {
				addPath(root, filePath, "file");
			}

			const totalNodesDiscovered = 1 + dirPaths.length + filePaths.length;
			const { lines, nodeLimitReached } = renderTree(root, effectiveMaxDepth, effectiveLimit);
			const renderedLines = lines.map((entry) => {
				if (entry.relativePath === ".") {
					return entry.line;
				}
				const nodeTag = entry.type === "dir" ? "dir" : "file";
				return `${entry.line} (type=${nodeTag})`;
			});

			const rawOutput = renderedLines.length > 0 ? renderedLines.join("\n") : `[D] ${rootLabel} (d:0, f:0)`;

			const truncation = truncateHead(rawOutput, { maxLines: Number.MAX_SAFE_INTEGER });
			const details: TreeToolDetails = {
				totalNodesDiscovered,
				nodesRendered: lines.length,
			};
			const notices: string[] = [];

			if (nodeLimitReached) {
				details.nodeLimitReached = effectiveLimit;
				notices.push(`${effectiveLimit} node limit reached`);
			}

			if (dirPaths.length >= scanLimit || filePaths.length >= scanLimit) {
				details.scanLimitReached = scanLimit;
				notices.push(`${scanLimit} scan limit reached`);
			}

			if (truncation.truncated) {
				details.truncation = truncation;
				notices.push(`${formatSize(DEFAULT_MAX_BYTES)} output limit reached`);
			}

			let output = truncation.content;
			if (notices.length > 0) {
				output += `\n\n[${notices.join(". ")}. Narrow path or lower maxDepth for faster scans.]`;
			}

			return {
				content: [{ type: "text", text: output }],
				details,
			};
		},
	};
}

export const treeTool = createTreeTool(process.cwd());
