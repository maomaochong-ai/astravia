// 把 workspace 包从 packages/ 复制到 node_modules/@astravia/<name>/
// （bun 用 symlink 指向 packages/，exFAT 不支持，改为真实副本）
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const nm = join(root, "node_modules");
const workspaces = [
  "action-rpc", "agent", "ai", "capability-runtime", "capability-sdk", "cli-app",
  "coding-agent", "desktop-app", "ecosystem-adapter", "runtime-core", "runtime-mcp",
  "runtime-storage", "runtime-telemetry", "runtime-tools", "skill-presets", "theme-sdk",
  "theme-ui", "toolkit", "ui",
  "plugins/plugin-sdk", "plugins/plugin-vite",
  "plugins/externals/cowart-astravia", "plugins/externals/global-slot-demo",
  "plugins/externals/mobile-ui-preview",
  "plugins/presets/chart-renderer", "plugins/presets/content-creation",
  "plugins/presets/git", "plugins/presets/image-gen", "plugins/presets/media-viewer",
  "plugins/presets/office-viewer", "plugins/presets/plugin-workbench",
  "plugins/presets/svg-viewer", "plugins/presets/astravia-actions",
  "plugins/presets/astravia-ui-design",
];

let copied = 0, errors = [];
for (const rel of workspaces) {
  const pkgPath = join(root, "packages", rel);
  const pkgJsonPath = join(pkgPath, "package.json");
  if (!existsSync(pkgJsonPath)) { errors.push(`missing ${rel}/package.json`); continue; }
  let name;
  try { name = JSON.parse(readFileSync(pkgJsonPath, "utf8")).name; } catch { errors.push(`bad json ${rel}`); continue; }
  if (!name || !name.startsWith("@astravia/")) { errors.push(`${rel} -> name=${name} (skipped, not @astravia/*)`); continue; }
  const dest = join(nm, ...name.split("/"));
  try {
    rmSync(dest, { recursive: true, force: true });
    mkdirSync(join(dest, ".."), { recursive: true });
    cpSync(pkgPath, dest, { recursive: true, force: true, verbatimSymlinks: true });
    copied++;
  } catch (err) { errors.push(`${name}: ${err.message}`); }
}

console.log(`workspace copied=${copied} errors=${errors.length}`);
if (errors.length) console.log(errors.join(" | "));
