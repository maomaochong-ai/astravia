// 解析 bun.lock：找出 minimatch/glob/ignore/@anthropic-ai/sdk 的所有版本及顶层 hoisted 版本
const fs = require("fs");
const s = fs.readFileSync("bun.lock", "utf8");
const m = s.match(/"packages":\s*\{([\s\S]*)\}\s*\}$/);
const inner = m[1];
const keys = [...inner.matchAll(/^  "([^"]+)":/gm)].map((x) => x[1]);

const targets = ["minimatch", "glob", "ignore", "@anthropic-ai/sdk", "@types/minimatch", "@types/glob", "@types/ignore"];
for (const t of targets) {
  const hits = keys.filter((k) => k === t || k.startsWith(t + "@") || k.startsWith("@" + t.split("/")[0] + "+" + t.split("/")[1] + "@"));
  console.log(t, "=>", hits.join(" | ") || "NONE");
}
// workspace 包声明的依赖版本
const wsKeys = keys.filter((k) => k.startsWith("packages/"));
console.log("\nworkspace keys:", wsKeys.length);
for (const wk of wsKeys) {
  const blockMatch = inner.match(new RegExp("^  \"\\Q" + wk.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\E\":\\s*\\{([\\s\\S]*?)\\n  \\},"));
  if (!blockMatch) continue;
  const block = blockMatch[1];
  for (const t of targets) {
    const depMatch = block.match(new RegExp("\\n      \"\\Q" + t + "\\E\": \"([^\"]+)\""));
    if (depMatch) console.log(wk, "dep:", t, "=>", depMatch[1]);
  }
}
