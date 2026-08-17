// 把 src/core/tools/*/description.txt 内联生成 src/core/tools/descriptions-data.ts。
//
// 为何 codegen 而非运行时读盘：同 generate-modes.mjs —— coding-agent 会被 desktop-app 的
// vite 打进 main bundle，也会被 `bun build --compile` 打进单文件二进制，两种情况下
// `import.meta.url` 都指向打包产物而非源码目录，readFileSync 必然落空。此前 26 个工具的
// description.txt 从未真正生效（loadToolDescription 静默走 catch 分支退回一行 fallback），
// 且 dist 里压根没有这些文件。构建期内联成字面量后运行时零文件系统依赖，三种形态一致。
//
// 触发：coding-agent 的 `bun run build` 会先跑本脚本（见 package.json `build`）。
// 手改 description.txt 后想立即生效，单独跑 `bun run generate:descriptions`。

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const toolsDir = join(__dirname, "..", "src", "core", "tools");
const outFile = join(toolsDir, "descriptions-data.ts");

const descriptions = {};
for (const entry of readdirSync(toolsDir).sort()) {
	const dir = join(toolsDir, entry);
	if (!statSync(dir).isDirectory()) continue;
	const file = join(dir, "description.txt");
	let raw;
	try {
		raw = readFileSync(file, "utf-8");
	} catch {
		continue;
	}
	const text = raw.trim();
	if (!text) {
		console.warn(`[generate-tool-descriptions] 跳过 ${entry}：description.txt 为空`);
		continue;
	}
	// key 是工具目录名，与 loadToolDescription 的调用参数一一对应。
	descriptions[entry] = text;
}

const content = `// AUTO-GENERATED from src/core/tools/*/description.txt by scripts/generate-tool-descriptions.mjs. Do not edit by hand.

/** 工具目录名 → 该工具的完整描述（LLM 可见）。缺失的工具退回其代码内的 fallback。 */
export const TOOL_DESCRIPTIONS: Record<string, string> = ${JSON.stringify(descriptions, null, "\t")};
`;

writeFileSync(outFile, content, "utf-8");
console.log(`[generate-tool-descriptions] 内联 ${Object.keys(descriptions).length} 份工具描述`);
