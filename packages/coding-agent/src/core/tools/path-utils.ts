import { accessSync, constants, readdirSync } from "node:fs";
import * as os from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve as resolvePath, sep } from "node:path";
import { CONFIG_DIR_NAME, getAgentDir, getAstraviaHomePath, getKnowledgeDir } from "../../config.js";

const UNICODE_SPACES = /[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g;
const NARROW_NO_BREAK_SPACE = "\u202F";
const CJK_CHARS = /[\u3400-\u9fff\uf900-\ufaff]/;

function normalizeUnicodeSpaces(str: string): string {
	return str.replace(UNICODE_SPACES, " ");
}

function tryMacOSScreenshotPath(filePath: string): string {
	return filePath.replace(/ (AM|PM)\./g, `${NARROW_NO_BREAK_SPACE}$1.`);
}

function tryNFDVariant(filePath: string): string {
	// macOS stores filenames in NFD (decomposed) form, try converting user input to NFD
	return filePath.normalize("NFD");
}

function tryCurlyQuoteVariant(filePath: string): string {
	// macOS uses U+2019 (right single quotation mark) in screenshot names like "Capture d'écran"
	// Users typically type U+0027 (straight apostrophe)
	return filePath.replace(/'/g, "\u2019");
}

/** Strip all ASCII spaces from a string for fuzzy comparison */
function stripSpaces(s: string): string {
	return s.replace(/ /g, "");
}

/**
 * When exact filename lookup fails, scan the parent directory for a single
 * entry whose name matches after stripping spaces.  This handles the common
 * case where an LLM inserts or removes spaces in CJK / mixed-script filenames
 * (e.g. "2026-2028 年度..." vs "2026-2028年度...").
 *
 * Returns the corrected absolute path, or undefined if no unique match is found.
 */
function tryFuzzyFilenameMatch(absolutePath: string): string | undefined {
	const dir = dirname(absolutePath);
	const target = stripSpaces(basename(absolutePath)).normalize("NFC");

	let entries: string[];
	try {
		entries = readdirSync(dir);
	} catch {
		return undefined;
	}

	const matches = entries.filter((e) => stripSpaces(e).normalize("NFC") === target);
	if (matches.length === 1) {
		return join(dir, matches[0]);
	}
	return undefined;
}

function fileExists(filePath: string): boolean {
	try {
		accessSync(filePath, constants.F_OK);
		return true;
	} catch {
		return false;
	}
}

function isLikelyLiteralPath(value: string): boolean {
	if (!value) return false;
	if (value.includes("$(") || value.includes("${") || value.includes("`")) return false;
	if (/[|;&<>*?[\]{}]/.test(value)) return false;

	if (value.includes("/") || value.includes("\\") || value.startsWith(".") || value.startsWith("~")) {
		return true;
	}

	if (/\.[A-Za-z0-9]{1,10}$/.test(value)) {
		// Bare filenames are only treated as path literals when they're likely to be
		// filename variants (CJK names or spacing around punctuation).
		return CJK_CHARS.test(value) || /\s[-_]\s/.test(value);
	}

	return false;
}

interface QuotedSegment {
	contentStart: number;
	contentEnd: number;
	value: string;
}

function findQuotedSegments(text: string): QuotedSegment[] {
	const segments: QuotedSegment[] = [];
	for (let i = 0; i < text.length; i++) {
		const quote = text[i];
		if (quote !== '"' && quote !== "'") continue;
		const start = i;
		let j = i + 1;
		for (; j < text.length; j++) {
			if (text[j] !== quote) continue;
			if (quote === '"' && text[j - 1] === "\\") continue;
			break;
		}
		if (j >= text.length) continue;
		segments.push({
			contentStart: start + 1,
			contentEnd: j,
			value: text.slice(start + 1, j),
		});
		i = j;
	}
	return segments;
}

function formatCorrectedPathLiteral(original: string, correctedAbsolutePath: string, cwd: string): string {
	const home = os.homedir();
	if (original === "~") return "~";
	if (original.startsWith("~/")) {
		if (correctedAbsolutePath === home) return "~";
		if (correctedAbsolutePath.startsWith(`${home}/`)) {
			return `~/${correctedAbsolutePath.slice(home.length + 1)}`;
		}
	}
	if (isAbsolute(original)) return correctedAbsolutePath;
	const rel = relative(cwd, correctedAbsolutePath);
	return rel.length > 0 ? rel : ".";
}

export interface PathLiteralCorrection {
	original: string;
	corrected: string;
}

export interface RewriteQuotedPathLiteralsResult {
	output: string;
	pathCorrections: PathLiteralCorrection[];
}

/**
 * Rewrite quoted path-like string literals to exact on-disk filenames.
 *
 * Only rewrites when:
 * 1) the literal resolves to a missing path, and
 * 2) resolveExistingPath finds a unique existing match.
 */
export function rewriteQuotedPathLiterals(input: string, cwd: string): RewriteQuotedPathLiteralsResult {
	let output = input;
	const pathCorrections: PathLiteralCorrection[] = [];
	const segments = findQuotedSegments(input);

	// Replace from end to start so segment offsets remain valid.
	for (let i = segments.length - 1; i >= 0; i--) {
		const segment = segments[i];
		if (!isLikelyLiteralPath(segment.value)) continue;

		const resolvedOriginalPath = resolveToCwd(segment.value, cwd);
		if (fileExists(resolvedOriginalPath)) continue;

		const resolvedCorrectedPath = resolveExistingPath(segment.value, cwd);
		if (resolvedCorrectedPath === resolvedOriginalPath) continue;
		if (!fileExists(resolvedCorrectedPath)) continue;

		const correctedLiteral = formatCorrectedPathLiteral(segment.value, resolvedCorrectedPath, cwd);
		if (correctedLiteral === segment.value) continue;

		output = output.slice(0, segment.contentStart) + correctedLiteral + output.slice(segment.contentEnd);
		pathCorrections.unshift({ original: segment.value, corrected: correctedLiteral });
	}

	return { output, pathCorrections };
}

export function expandPath(filePath: string): string {
	const normalized = normalizeUnicodeSpaces(filePath);
	if (normalized === "~") {
		return os.homedir();
	}
	if (normalized.startsWith("~/")) {
		return os.homedir() + normalized.slice(1);
	}
	return normalized;
}

/**
 * Resolve a path relative to the given cwd.
 * Handles ~ expansion and absolute paths.
 */
export function resolveToCwd(filePath: string, cwd: string): string {
	const expanded = expandPath(filePath);
	if (isAbsolute(expanded)) {
		return expanded;
	}
	return resolvePath(cwd, expanded);
}

/**
 * Resolve a path for writing:
 * - if requested path already exists, keep it;
 * - if not, but a unique fuzzy existing path matches, return that existing path;
 * - otherwise return the original resolved path (new file target).
 */
export function resolveWritablePath(filePath: string, cwd: string): string {
	const resolved = resolveToCwd(filePath, cwd);
	if (fileExists(resolved)) return resolved;
	const corrected = resolveExistingPath(filePath, cwd);
	if (corrected !== resolved && fileExists(corrected)) return corrected;
	return resolved;
}

/**
 * Resolve a path that must refer to an existing file/directory.
 * Tries multiple fuzzy-matching strategies when exact lookup fails:
 *   1. macOS AM/PM narrow-space variant
 *   2. NFD (decomposed) variant
 *   3. Curly-quote variant
 *   4. NFD + curly-quote combined
 *   5. Strip-spaces fuzzy match (handles LLM-inserted spaces in CJK filenames)
 *
 * Falls back to the unmodified resolved path if nothing matches.
 */
export function resolveExistingPath(filePath: string, cwd: string): string {
	const resolved = resolveToCwd(filePath, cwd);

	if (fileExists(resolved)) {
		return resolved;
	}

	// Try macOS AM/PM variant (narrow no-break space before AM/PM)
	const amPmVariant = tryMacOSScreenshotPath(resolved);
	if (amPmVariant !== resolved && fileExists(amPmVariant)) {
		return amPmVariant;
	}

	// Try NFD variant (macOS stores filenames in NFD form)
	const nfdVariant = tryNFDVariant(resolved);
	if (nfdVariant !== resolved && fileExists(nfdVariant)) {
		return nfdVariant;
	}

	// Try curly quote variant (macOS uses U+2019 in screenshot names)
	const curlyVariant = tryCurlyQuoteVariant(resolved);
	if (curlyVariant !== resolved && fileExists(curlyVariant)) {
		return curlyVariant;
	}

	// Try combined NFD + curly quote (for French macOS screenshots like "Capture d'écran")
	const nfdCurlyVariant = tryCurlyQuoteVariant(nfdVariant);
	if (nfdCurlyVariant !== resolved && fileExists(nfdCurlyVariant)) {
		return nfdCurlyVariant;
	}

	// Fuzzy match: LLMs often insert/remove spaces in CJK filenames.
	// Search the parent directory for a file whose name matches after stripping all spaces.
	const fuzzyMatch = tryFuzzyFilenameMatch(resolved);
	if (fuzzyMatch) {
		return fuzzyMatch;
	}

	return resolved;
}

/** @deprecated Use resolveExistingPath instead */
export function resolveReadPath(filePath: string, cwd: string): string {
	return resolveExistingPath(filePath, cwd);
}

// =============================================================================
// Skill directory write-protection
// =============================================================================

/**
 * Check if a resolved absolute path falls inside a skill directory.
 * These directories are read-only + executable — agents must never write into them.
 *
 * Protected directories:
 * - ~/.astravia/agent/skills/
 * - ~/.astravia/skills/
 * - <cwd>/.astravia/skills/
 * - ~/.agents/skills/        (generic Agent Skill convention)
 * - <cwd>/.agents/skills/    (generic Agent Skill convention)
 */
export function isProtectedSkillPath(absolutePath: string, cwd: string): boolean {
	const resolved = resolvePath(absolutePath);
	const protectedDirs = [
		resolvePath(join(getAgentDir(), "skills")),
		resolvePath(join(getAstraviaHomePath(), "skills")),
		resolvePath(cwd, CONFIG_DIR_NAME, "skills"),
		resolvePath(join(os.homedir(), ".agents", "skills")),
		resolvePath(cwd, ".agents", "skills"),
	];

	for (const dir of protectedDirs) {
		const prefix = dir.endsWith(sep) ? dir : `${dir}${sep}`;
		if (resolved === dir || resolved.startsWith(prefix)) {
			return true;
		}
	}
	return false;
}

// =============================================================================
// Knowledge base wiki write-protection
// =============================================================================

/**
 * 知识库 wiki/ 是 kb_write_page 独占的产物区（守封闭 frontmatter schema、分配稳定 id）。
 * 通用 write/edit 绝不能往里写——否则会写出无/坏 frontmatter 的页，被 scanWikiPages 静默
 * 丢弃，其源文件永远显示未加工 + 每轮重加工。跨平台路径前缀判定（不依赖仅 POSIX 的 OS 锁）。
 * 注意：仅挡 wiki/ 产物区；解析脚本、临时文件、工具输出写到 cwd/tmp 等处不受影响。
 */
export function isKnowledgeWikiPath(absolutePath: string): boolean {
	const resolved = resolvePath(absolutePath);
	const wikiDir = resolvePath(join(getKnowledgeDir(), "wiki"));
	const prefix = wikiDir.endsWith(sep) ? wikiDir : `${wikiDir}${sep}`;
	return resolved === wikiDir || resolved.startsWith(prefix);
}
