// 修复多版本包：从 bun.lock 解析顶层 hoisted 版本，覆盖 node_modules 中的错误版本
// bun 1.3 lockfile 格式：顶层条目键为 "<name>"（scoped 包为 "@scope/name"），
// 嵌套条目键为 "<parent>/<name>" 或 "<parent>/<scope>/<name>"（不以 @ 开头且含 /）。
import { readFileSync, readdirSync, existsSync, cpSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const nm = join(root, "node_modules");
const bunDir = join(nm, ".bun");
const s = readFileSync(join(root, "bun.lock"), "utf8");

// 提取所有条目：key -> 首元素（name@version）
const entries = new Map();
for (const m of s.matchAll(/^    "([^"]+)": \["([^"]+)"/gm)) {
  entries.set(m[1], m[2]); // key -> "name@version"
}

// 顶层键 = 不以 "/" 开头（scoped 包 "@scope/name" 允许 /，但以 @ 开头）
// 顶层键：@ 开头的必须正好两段（@scope/name），非 @ 的不能含 /；排除 workspace 键
const topKeys = [...entries.keys()].filter((k) =>
  !k.startsWith("/") &&
  !k.startsWith("packages/") &&
  ((k.startsWith("@") && k.split("/").length === 2) || (!k.startsWith("@") && !k.includes("/")))
);
// 注意：workspace 键是 "packages/..." 或 ""，需要排除
const realTopKeys = topKeys.filter((k) => k !== "" && !k.startsWith("packages/"));

let fixed = 0, skipped = 0, errors = [];
for (const key of realTopKeys) {
  const spec = entries.get(key); // "name@version"
  if (!spec) { skipped++; continue; }
  const at = spec.lastIndexOf("@");
  const name = spec.slice(0, at);
  const version = spec.slice(at + 1);
  // 在 .bun 中查找对应条目：<name>@<version>（scoped 包为 @scope+name@version），
  // 目录名可能带 +hash 后缀，用前缀匹配
  const bunName = name.startsWith("@") ? name.replace("/", "+") + "@" + version : name + "@" + version;
  const dest = join(nm, ...name.split("/"));
  const allBun = readdirSync(bunDir, { withFileTypes: true });
  const matchEntry = allBun.find((e) => e.isDirectory() && (e.name === bunName || e.name.startsWith(bunName + "+")));
  if (!matchEntry) { skipped++; continue; }
  const src = join(bunDir, matchEntry.name, "node_modules", ...name.split("/"));
  if (!existsSync(src)) { skipped++; continue; }
  // 已存在且版本正确则跳过
  const destPkg = join(dest, "package.json");
  if (existsSync(destPkg)) {
    try {
      const cur = JSON.parse(readFileSync(destPkg, "utf8"));
      if (cur.version === version) { skipped++; continue; }
    } catch {}
  }
  try {
    rmSync(dest, { recursive: true, force: true });
    mkdirSync(join(dest, ".."), { recursive: true });
    cpSync(src, dest, { recursive: true, force: true, verbatimSymlinks: true });
    fixed++;
  } catch (err) { errors.push(`${name}: ${err.message}`); }
}

console.log(`fixed=${fixed} skipped=${skipped} errors=${errors.length} totalTop=${realTopKeys.length}`);
if (errors.length) console.log("errors:", errors.slice(0, 5).join(" | "));
