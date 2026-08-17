// 生成 node_modules/.bin shim（Windows .cmd + bash 无扩展 shim）
import { readdirSync, readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const root = process.cwd();
const nm = join(root, "node_modules");
const binDir = join(nm, ".bin");
mkdirSync(binDir, { recursive: true });

const bins = [];
for (const name of readdirSync(nm)) {
  if (name.startsWith(".")) continue;
  const pj = join(nm, name, "package.json");
  if (!existsSync(pj)) continue;
  let pkg;
  try { pkg = JSON.parse(readFileSync(pj, "utf8")); } catch { continue; }
  const b = pkg.bin;
  if (!b) continue;
  const entries = typeof b === "string" ? [[pkg.name, b]] : Object.entries(b);
  for (const [binName, rel] of entries) {
    const target = join(nm, ...name.split("/"), ...rel.split("/"));
    if (!existsSync(target)) continue;
    bins.push([binName, target]);
  }
}

let count = 0;
for (const [binName, target] of bins) {
  const relFromBin = relative(binDir, target).split(sep).join("/");
  const winRel = relFromBin.split("/").join("\\");
  const cmd = `@ECHO off\r\nGOTO start\r\n:find_dp0\r\nSET dp0=%~dp0\r\nEXIT /b\r\n:start\r\nSETLOCAL\r\nCALL :find_dp0\r\n\r\nIF EXIST "%dp0%\\node.exe" (\r\n  SET "_prog=%dp0%\\node.exe"\r\n) ELSE (\r\n  SET "_prog=node"\r\n)\r\nSET PATHEXT=%PATHEXT:;.JS;=;%\r\n\r\nendLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\${winRel}" %*\r\n`;
  writeFileSync(join(binDir, binName + ".cmd"), cmd);
  const bash = `#!/bin/sh\nbasedir=$(dirname "$(echo "$0" | sed -e 's,\\\\,/,g')")\nexec node "$basedir/${relFromBin}" "$@"\n`;
  writeFileSync(join(binDir, binName), bash);
  count++;
}
console.log(`bins generated: ${count}`);
console.log(bins.map(([n]) => n).join(", "));
