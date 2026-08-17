// 替换 CHANGELOG [Unreleased] 段内的品牌词（已发布版本 section 不动）
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

for (const f of FILES) {
  let content;
  try {
    content = readFileSync(f, "utf8");
  } catch {
    continue;
  }
  const lines = content.split("\n");
  // 找 [Unreleased] 段范围
  let unrelIdx = -1, endIdx = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (/^## \[Unreleased/.test(lines[i])) { unrelIdx = i; break; }
  }
  if (unrelIdx === -1) continue;
  for (let i = unrelIdx + 1; i < lines.length; i++) {
    if (/^## \[/.test(lines[i])) { endIdx = i; break; }
  }
  // 只替换 [Unreleased] 段（不含标题行本身）
  let changed = 0;
  for (let i = unrelIdx + 1; i < endIdx; i++) {
    const orig = lines[i];
    // 跳过我们刚加的 rebrand 说明条目（含 @vetta/* 对照字样）
    if (orig.includes("品牌更名 Astravia")) continue;
    const replaced = orig.replace(/Vetta/g, "Astravia").replace(/vetta/g, "astravia");
    if (replaced !== orig) {
      lines[i] = replaced;
      changed++;
    }
  }
  if (changed > 0) {
    writeFileSync(f, lines.join("\n"), "utf8");
    console.log(`已更新 ${changed} 行: ${f}`);
  } else {
    console.log(`无需修改: ${f}`);
  }
}
console.log("完成");
