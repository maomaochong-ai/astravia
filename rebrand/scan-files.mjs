// 补充替换脚本：扫描文件系统（不依赖 git 索引），处理大写常量与点文件
// 用法: bun rebrand/scan-files.mjs [--dry-run]
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, basename } from "node:path";

const ROOT = process.cwd();
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "releases", ".next", "coverage", "build-output", "out", ".turbo"]);
const TEXT_EXT = new Set(["ts", "tsx", "js", "mjs", "cjs", "json", "md", "yml", "yaml", "html", "css", "txt", "toml", "go", "rs", "svg", "vue", "svelte", "mdx", "lock", "mcp", "env", "conf", "properties"]);
const DRY_RUN = process.argv.includes("--dry-run");

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(p, out);
    } else {
      out.push(p);
    }
  }
  return out;
}

function isText(p) {
  const base = basename(p);
  if (base.startsWith(".") && !base.includes(".")) return true; // 点文件
  const ext = base.includes(".") ? base.split(".").pop().toLowerCase() : "";
  return !ext || TEXT_EXT.has(ext);
}

const REPLACEMENTS = [
  ["@vetta-org/", "@astravia-org/"],
  ["@vetta/", "@astravia/"],
  ["vetta-monorepo", "astravia-monorepo"],
  ["getVettaHomePath", "getAstraviaHomePath"],
  ["VETTA_HOME", "ASTRAVIA_HOME"],
  ["VETTA_", "ASTRAVIA_"],
  ["VETTA", "ASTRAVIA"],
  ["Vetta", "Astravia"],
  ["vetta", "astravia"],
];

function replaceContent(content) {
  let out = content;
  for (const [from, to] of REPLACEMENTS) {
    if (out.includes(from)) out = out.split(from).join(to);
  }
  return out;
}

const files = walk(ROOT).filter((p) => isText(p) && !p.includes(`${"rebrand"}`));
let changed = 0, strings = 0, failed = 0;
for (const p of files) {
  try {
    const content = readFileSync(p, "utf8");
    const replaced = replaceContent(content);
    if (replaced !== content) {
      changed++;
      strings += (content.match(/vetta|Vetta|VETTA/g) || []).length;
      if (!DRY_RUN) writeFileSync(p, replaced, "utf8");
    }
  } catch (e) {
    failed++;
    if (failed <= 5) console.error(`失败: ${p}: ${e.message}`);
  }
}
console.log(`[${DRY_RUN ? "DRY-RUN" : "APPLIED"}] 修改文件: ${changed}, 替换字符串: ${strings}, 失败: ${failed}`);
