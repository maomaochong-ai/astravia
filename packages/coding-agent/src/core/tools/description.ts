import { TOOL_DESCRIPTIONS } from "./descriptions-data.js";

/**
 * 取工具的完整描述（LLM 可见）。内容在构建期由 scripts/generate-tool-descriptions.mjs
 * 从同目录的 description.txt 内联进 descriptions-data.ts——不能运行时读盘，因为本包会被
 * desktop-app 的 vite 打进 main bundle、也会被 `bun build --compile` 打进单文件二进制，
 * 两种形态下相对 import.meta.url 的路径都不再指向源码目录（此前正是如此静默失效的）。
 *
 * @param toolKey 工具目录名（`src/core/tools/<toolKey>/`）。
 * @param fallback 没有 description.txt 时用的简短描述。
 */
export function loadToolDescription(toolKey: string, fallback: string): string {
	return TOOL_DESCRIPTIONS[toolKey] ?? fallback;
}
