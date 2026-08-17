// 清理 CHANGELOG 中重复的 rebrand 条目
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

const ENTRY_MARK = "- **品牌更名 Astravia**";

for (const f of FILES) {
  let content;
  try {
    content = readFileSync(f, "utf8");
  } catch {
    continue;
  }
  const lines = content.split("\n");
  const out = [];
  let seenEntry = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith(ENTRY_MARK)) {
      if (seenEntry) continue; // 跳过重复条目
      seenEntry = true;
      out.push(line);
      continue;
    }
    // 若条目后紧跟空行且下下个还是条目，忽略（已在上面处理）
    out.push(line);
  }
  // 清理「### Changed 块内条目后的多余空行」：ENTRY 后连续空行压成一个
  const joined = out.join("\n").replace(/(品牌更名 Astravia[^\n]*\n)\n{2,}/g, "$1\n");
  if (joined !== content) {
    writeFileSync(f, joined, "utf8");
    console.log(`已去重: ${f}`);
  } else {
    console.log(`无需修改: ${f}`);
  }
}
console.log("完成");
