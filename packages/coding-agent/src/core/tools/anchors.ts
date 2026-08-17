/**
 * 行锚点引擎（锚点式编辑的公共底座）。
 *
 * 锚点格式：`<line>:<hhhh>`——`line` 为 1-based 行号（仅作提示，非权威），`hhhh` 为该行
 * 内容做空白归一化后的 FNV-1a 哈希（4 位 base36）。read/grep 输出行带锚点前缀，
 * edit 锚点模式凭锚点定位：哈希是身份、行号是起搜位置——行号对不上时在小半径内
 * 按哈希找回（shifted）；找不到、或半径内出现多个同哈希候选（无法凭漂移消歧，
 * 典型为空行/`}` 等重复行）一律判过期（stale），绝不静默猜一行——错猜正是「多次
 * 编辑产生重复片段」的根因。
 *
 * 模型无法自行计算哈希，只能引用工具返回值——等价于机制层面强制「先读后改」。
 */

/** 锚点行号漂移的搜索半径（上下各 N 行）。 */
export const ANCHOR_SEARCH_RADIUS = 20;

/** 读输出的锚点分隔符。`42:ab→content` 中 `42:ab` 是锚点，`→` 后是内容。 */
export const ANCHOR_SEPARATOR = "→";

/** 锚点哈希的 base36 位宽。4 位≈168 万取值，使不同内容行在 ±radius 窗口内的偶然碰撞可忽略。 */
export const ANCHOR_HASH_WIDTH = 4;

/** 该行内容的锚点哈希：空白全剥离后 FNV-1a 32-bit，取 base36 末 {@link ANCHOR_HASH_WIDTH} 位。 */
export function anchorLineHash(line: string): string {
	const normalized = line.replace(/\s+/g, "");
	let hash = 0x811c9dc5;
	for (let i = 0; i < normalized.length; i++) {
		hash ^= normalized.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(36).padStart(ANCHOR_HASH_WIDTH, "0").slice(-ANCHOR_HASH_WIDTH);
}

export interface ParsedAnchor {
	line: number;
	hash: string;
}

/** 解析 `42:ab` 形式的锚点；容忍模型把 `→` 及后续内容误带上（截断丢弃）。 */
export function parseAnchor(anchor: string): ParsedAnchor | undefined {
	const cleaned = anchor.split(ANCHOR_SEPARATOR, 1)[0]?.trim() ?? "";
	// 宽松位宽（2..8）：容忍历史 2 位锚点与未来调宽，避免格式微调即全面失配。
	const match = /^(\d+):([0-9a-z]{2,8})$/.exec(cleaned);
	if (!match) return undefined;
	const line = Number.parseInt(match[1], 10);
	if (line < 1) return undefined;
	return { line, hash: match[2] };
}

/** 全文件按哈希收集匹配行号（1-based）。纯哈希锚点（缺 `行号:` 前缀）的降级找回用。 */
export function findHashLines(lines: string[], hash: string): number[] {
	const hits: number[] = [];
	for (let i = 0; i < lines.length; i++) {
		if (anchorLineHash(lines[i]) === hash) hits.push(i + 1);
	}
	return hits;
}

export type AnchorValidation =
	| { status: "ok"; line: number }
	| { status: "shifted"; line: number }
	| { status: "stale" };

/**
 * 校验锚点：行号处哈希匹配 → ok（行号精确命中即信任，是常态好路径）；否则在 ±radius
 * 内按哈希搜索——恰好 1 个候选 → shifted（唯一，可放心迁移）；**≥2 个同哈希候选 → stale**
 * （漂移无法消歧，典型为空行/重复 `}`，静默取最近者正是重复片段的根因）；0 个 → stale。
 * `lines` 为文件全部行（0-based 数组，行号 1-based）。
 */
export function validateAnchor(
	lines: string[],
	anchor: ParsedAnchor,
	radius: number = ANCHOR_SEARCH_RADIUS,
): AnchorValidation {
	const idx = anchor.line - 1;
	if (idx >= 0 && idx < lines.length && anchorLineHash(lines[idx]) === anchor.hash) {
		return { status: "ok", line: anchor.line };
	}
	// 由近及远收集半径内全部同哈希候选；出现第二个即判歧义（stale），不猜。
	let firstHit = -1;
	for (let distance = 1; distance <= radius; distance++) {
		for (const candidate of [idx - distance, idx + distance]) {
			if (candidate >= 0 && candidate < lines.length && anchorLineHash(lines[candidate]) === anchor.hash) {
				if (firstHit === -1) {
					firstHit = candidate;
				} else {
					return { status: "stale" };
				}
			}
		}
	}
	return firstHit === -1 ? { status: "stale" } : { status: "shifted", line: firstHit + 1 };
}

/** 给一段行内容加锚点前缀。`startLine` 为第一行的 1-based 行号。 */
export function renderAnchoredLines(lines: string[], startLine: number): string[] {
	return lines.map((line, i) => `${startLine + i}:${anchorLineHash(line)}${ANCHOR_SEPARATOR}${line}`);
}

/**
 * 渲染某行附近 ±context 行的新鲜锚点（错误回传 / 编辑成功回执用），
 * 让模型无需重读文件即可立刻重试或继续编辑。
 */
export function renderAnchorRegion(lines: string[], centerLine: number, context = 3): string {
	const start = Math.max(1, centerLine - context);
	const end = Math.min(lines.length, centerLine + context);
	if (end < start) return "(file is empty)";
	return renderAnchoredLines(lines.slice(start - 1, end), start).join("\n");
}
