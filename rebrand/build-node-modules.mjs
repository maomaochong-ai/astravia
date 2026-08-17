// Plan B: 把 bun 在 .bun staging 里解压的完整包内容复制成标准 node_modules 布局。
// 背景：E 盘是 exFAT，不支持 symlink/junction，bun 无法建立顶层链接（EISDIR/ENOTSUP）。
// .bun/<name>@<version>/node_modules/<name>/ 里是包的完整真实内容，复制到 node_modules/<name>/。
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, sep } from "node:path";

const root = process.cwd();
const bunDir = join(root, "node_modules", ".bun");
const nm = join(root, "node_modules");

// ---------- 1. 解析 bun.lock 顶层 package 键（决定 hoisted 版本与 name 映射） ----------
// 简化：不依赖 bun.lock（其格式内部化）。直接从 .bun 条目名解析 name/version。
// 条目名规则：<name>@<version> 或 <scope>+<name>@<version> 或 <name>@<version>+<hash>
function parseEntry(name) {
  // 去掉 +hash（版本后的 + 前缀）
  let v = name.split("@").pop() || "";
  v = v.split("+")[0];
  // scope 包：@scope+name@version
  const m = name.match(/^(@[^@+]+)\+([^@]+)@(.+)$/);
  if (m) return { pkg: `${m[1]}/${m[2]}`, version: m[3].split("+")[0] };
  const m2 = name.match(/^([^@]+)@(.+)$/);
  if (m2) return { pkg: m2[1], version: m2[2].split("+")[0] };
  return { pkg: name, version: "" };
}

// ---------- 2. 复制 .bun 条目 ----------
const entries = readdirSync(bunDir, { withFileTypes: true });
let copied = 0, skipped = 0, multi = new Map(), errors = [];
for (const e of entries) {
  if (e.name === "node_modules") continue; // scope hoisted 占位/内容，单独处理
  if (e.name.startsWith(".old_modules") || e.name.startsWith(".tmp")) continue;
  if (!e.isDirectory()) continue;
  const { pkg, version } = parseEntry(e.name);
  if (!pkg) { skipped++; continue; }
  // 内容源：<entry>/node_modules/<pkg>
  const src = join(bunDir, e.name, "node_modules", ...pkg.split("/"));
  const dest = join(nm, ...pkg.split("/"));
  if (!existsSync(src)) { skipped++; continue; }
  if (multi.has(pkg)) multi.set(pkg, multi.get(pkg) + 1); else multi.set(pkg, 1);
  try {
    rmSync(dest, { recursive: true, force: true });
    mkdirSync(join(dest, ".."), { recursive: true });
    cpSync(src, dest, { recursive: true, force: true, verbatimSymlinks: true });
    copied++;
  } catch (err) {
    errors.push(`${pkg}: ${err.message}`);
  }
}

// ---------- 3. 复制 .bun/node_modules（scope hoisted 内容，如 @types/*） ----------
const bunNM = join(bunDir, "node_modules");
if (existsSync(bunNM)) {
  const scopes = readdirSync(bunNM, { withFileTypes: true });
  for (const sc of scopes) {
    if (!sc.isDirectory() || !sc.name.startsWith("@")) continue;
    const scopeDir = join(bunNM, sc.name);
    const members = readdirSync(scopeDir, { withFileTypes: true });
    for (const mem of members) {
      if (!mem.isDirectory()) continue;
      const src = join(scopeDir, mem.name);
      const dest = join(nm, sc.name, mem.name);
      if (existsSync(join(src, "package.json"))) {
        try {
          rmSync(dest, { recursive: true, force: true });
          mkdirSync(join(dest, ".."), { recursive: true });
          cpSync(src, dest, { recursive: true, force: true, verbatimSymlinks: true });
          copied++;
        } catch (err) { errors.push(`${sc.name}/${mem.name}: ${err.message}`); }
      }
    }
  }
}

console.log(`copied=${copied} skipped=${skipped} errors=${errors.length}`);
if (errors.length) console.log("errors:", errors.slice(0, 10).join(" | "));
const dupes = [...multi.entries()].filter(([, n]) => n > 1);
console.log("multi-version packages:", dupes.length);
console.log(dupes.slice(0, 10).map(([p, n]) => `${p}(${n})`).join(", "));
