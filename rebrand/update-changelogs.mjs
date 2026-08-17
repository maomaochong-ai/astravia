// CHANGELOG rebrand 条目脚本
// 规则：只改 [Unreleased] 段 + 头部声明行，已发布版本 section 不动
import { readFileSync, writeFileSync } from "node:fs";

const FILES = [
  "packages/agent/CHANGELOG.md",
  "packages/ai/CHANGELOG.md",
  "packages/coding-agent/CHANGELOG.md",
  "packages/desktop-app/CHANGELOG.md",
  "packages/ecosystem-adapter/CHANGELOG.md",
  "packages/im-gateway/CHANGELOG.md",
  "packages/plugins/plugin-sdk/CHANGELOG.md",
  "packages/plugins/plugin-vite/CHANGELOG.md",
  "packages/plugins/presets/content-creation/CHANGELOG.md",
  "packages/runtime-core/CHANGELOG.md",
  "packages/runtime-telemetry/CHANGELOG.md",
];

const ENTRY = "- **品牌更名 Astravia**：全库由 Vetta 更名为 Astravia（`@vetta/*` → `@astravia/*`；应用名、窗口标题、协议、数据目录与 UI 文案同步更新）。";

for (const f of FILES) {
  let content;
  try {
    content = readFileSync(f, "utf8");
  } catch {
    console.error(`读取失败: ${f}`);
    continue;
  }

  // 1. 头部声明行（第 3 行附近）：@vetta/ -> @astravia/
  content = content.replace(/All notable changes to `@vetta\//g, "All notable changes to `@astravia/");
  content = content.replace(/All notable changes to `@vetta-org\//g, "All notable changes to `@astravia-org/");

  // 2. 定位 [Unreleased] 段：从 ## [Unreleased 行到下一个 ## [ 行（或文件末尾）
  const lines = content.split("\n");
  let unrelIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^## \[Unreleased/.test(lines[i])) {
      unrelIdx = i;
      break;
    }
  }
  if (unrelIdx === -1) {
    console.error(`未找到 [Unreleased] 段: ${f}`);
    continue;
  }
  let endIdx = lines.length;
  for (let i = unrelIdx + 1; i < lines.length; i++) {
    if (/^## \[/.test(lines[i])) {
      endIdx = i;
      break;
    }
  }
  const section = lines.slice(unrelIdx + 1, endIdx).join("\n");
  let newSection;

  const changedIdx = section.match(/^### Changed\n/m);
  if (changedIdx) {
    // 已有 ### Changed：在它后面第一个空行后插入条目
    const idx = changedIdx.index + changedIdx[0].length;
    newSection = section.slice(0, idx) + ENTRY + "\n" + section.slice(idx);
  } else {
    // 没有 ### Changed：在 [Unreleased] 标题后、第一个 ### 前插入
    const firstSub = section.match(/^### /m);
    if (firstSub) {
      newSection = "### Changed\n\n" + ENTRY + "\n\n" + section.slice(0, firstSub.index) + section.slice(firstSub.index);
    } else {
      newSection = "### Changed\n\n" + ENTRY + "\n" + section;
    }
  }

  const newLines = [...lines.slice(0, unrelIdx + 1), ...newSection.split("\n"), ...lines.slice(endIdx)];
  content = newLines.join("\n");
  writeFileSync(f, content, "utf8");
  console.log(`已更新: ${f}`);
}
console.log("全部完成");
