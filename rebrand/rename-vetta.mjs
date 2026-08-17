// 品牌替换脚本 v2：Vetta/vetta -> Astravia/astravia
// 用法: bun rebrand/rename-vetta.mjs [--dry-run]
// 健壮性：逐文件 try/catch + 进度输出，不因单个文件失败而中断
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { join, dirname, basename } from "node:path";

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "releases", ".next", "coverage", "build-output", "out"]);
const TEXT_EXT = new Set(["ts", "tsx", "js", "mjs", "cjs", "json", "md", "yml", "yaml", "html", "css", "txt", "toml", "go", "rs", "svg", "vue", "svelte", "mdx", "lock", "mcp", "env", "conf", "properties"]);
const DRY_RUN = process.argv.includes("--dry-run");

let tracked = [];
try {
  tracked = execSync("git ls-files", { encoding: "utf8", maxBuffer: 128 * 1024 * 1024 })
    .split("\n")
    .map((s) => s.trim().replace(/\\/g, "/"))
    .filter(Boolean);
} catch {
  console.error("git 不可用，需在 git 仓库中运行");
  process.exit(1);
}

function shouldSkip(p) {
  const parts = p.split("/");
  for (const part of parts) if (SKIP_DIRS.has(part)) return true;
  const base = basename(p);
  // 点文件（.vercelignore / .gitignore 等）按文本处理
  if (base.startsWith(".") && base.length > 1 && !base.includes(".")) return false;
  const ext = base.includes(".") ? base.split(".").pop().toLowerCase() : "";
  if (ext && !TEXT_EXT.has(ext)) return true;
  return false;
}

const files = tracked.filter((p) => !shouldSkip(p));
console.log(`待处理文件数: ${files.length}`);

const REPLACEMENTS = [
  ["@vetta-org/", "@astravia-org/"],
  ["@vetta/", "@astravia/"],
  ["vetta-monorepo", "astravia-monorepo"],
  ["getVettaHomePath", "getAstraviaHomePath"],
  ["VETTA_HOME", "ASTRAVIA_HOME"],
  // 全大写环境变量前缀（VETTA_ACTION_RPC_... 等）
  ["VETTA_", "ASTRAVIA_"],
  // 全大写常量名（VETTA_FOUNDATION / VETTA_DOMAIN / VETTA: "astravia" 等）
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

let changedFiles = 0;
let changedStrings = 0;
let failedFiles = 0;
const fileRenamePlan = [];
const RENAME_EXTS = new Set(["ts", "tsx", "js", "mjs", "cjs", "json", "md", "yml", "yaml", "svg", "css", "html", "mcp", "txt", "vue", "svelte", "mdx"]);

for (let i = 0; i < files.length; i++) {
  const p = files[i];
  if (i % 300 === 0) console.log(`进度: ${i}/${files.length}`);
  try {
    const content = readFileSync(p, "utf8");
    const replaced = replaceContent(content);
    if (replaced !== content) {
      changedFiles++;
      changedStrings += (content.match(/vetta|Vetta/g) || []).length;
      if (!DRY_RUN) writeFileSync(p, replaced, "utf8");
    }
    // 文件名/目录名重命名计划（仅文本类扩展名）
    const ext = basename(p).includes(".") ? basename(p).split(".").pop().toLowerCase() : "";
    if (RENAME_EXTS.has(ext)) {
      const segs = p.split("/").map((seg) => seg.replace(/Vetta/g, "Astravia").replace(/vetta/g, "astravia"));
      const newPath = segs.join("/");
      if (newPath !== p) fileRenamePlan.push([p, newPath]);
    }
  } catch (e) {
    failedFiles++;
    if (failedFiles <= 10) console.error(`失败: ${p}: ${e.message}`);
  }
}

console.log(`[${DRY_RUN ? "DRY-RUN" : "APPLIED"}] 修改文件: ${changedFiles}, 替换字符串: ${changedStrings}, 失败: ${failedFiles}`);

// 重命名：先深层后浅层，避免目录冲突
const unique = new Map();
for (const [from, to] of fileRenamePlan) {
  if (!unique.has(from) || unique.get(from) !== to) unique.set(from, to);
}
const plan = [...unique.entries()].sort((a, b) => b[0].length - a[0].length);
if (plan.length) {
  console.log(`--- 待重命名 ${plan.length} 项 ---`);
  for (const [from, to] of plan) {
    console.log(`  ${from} -> ${to}`);
    if (!DRY_RUN && from !== to) {
      try {
        if (dirname(to) !== dirname(from)) {
          const { mkdirSync } = await import("node:fs");
          mkdirSync(dirname(to), { recursive: true });
        }
        renameSync(from, to);
      } catch (e) {
        console.error(`重命名失败: ${from}: ${e.message}`);
      }
    }
  }
}
console.log("完成");
