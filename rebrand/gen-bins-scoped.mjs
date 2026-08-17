// 补充生成 scoped 包（@scope/name）的 .bin shim
import { readdirSync, readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const root = process.cwd();
const nm = join(root, "node_modules");
const binDir = join(nm, ".bin");
mkdirSync(binDir, { recursive: true });

const bins = [];
// 遍历 node_modules/@scope/name 两层
for (const scope of readdirSync(nm)) {
  if (!scope.startsWith("@")) continue;
  const scopeDir = join(nm, scope);
  if (!existsSync(join(scopeDir, "package.json"))) {
    for (const name of readdirSync(scopeDir)) {
      const pj = join(scopeDir, name, "package.json");
      if (!existsSync(pj)) continue;
      let pkg;
      try { pkg = JSON.parse(readFileSync(pj, "utf8")); } catch { continue; }
      const b = pkg.bin;
      if (!b) continue;
      const entries = typeof b === "string" ? [[pkg.name, b]] : Object.entries(b);
      for (const [binName, rel] of entries) {
        const target = join(scopeDir, name, ...rel.split("/"));
        if (!existsSync(target)) continue;
        bins.push([binName, target]);
      }
    }
  }
}

let count = 0;
for (const [binName, target] of bins) {
  // scoped bin 名（如 @babel/parser）需嵌套目录
  const binOut = join(binDir, ...binName.split("/"));
  mkdirSync(join(binOut, ".."), { recursive: true });
  const relFromBin = relative(binDir, target).split(sep).join("/");
  const winRel = relFromBin.split("/").join("\\");
  const cmd = `@ECHO off\r\nGOTO start\r\n:find_dp0\r\nSET dp0=%~dp0\r\nEXIT /b\r\n:start\r\nSETLOCAL\r\nCALL :find_dp0\r\n\r\nIF EXIST "%dp0%\\node.exe" (\r\n  SET "_prog=%dp0%\\node.exe"\r\n) ELSE (\r\n  SET "_prog=node"\r\n)\r\nSET PATHEXT=%PATHEXT:;.JS;=;%\r\n\r\nendLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\${winRel}" %*\r\n`;
  writeFileSync(binOut + ".cmd", cmd);
  const bash = `#!/bin/sh\nbasedir=$(dirname "$(echo "$0" | sed -e 's,\\\\,/,g')")\nexec node "$basedir/${relFromBin}" "$@"\n`;
  writeFileSync(binOut, bash);
  count++;
}
console.log(`scoped bins generated: ${count}`);
console.log(bins.map(([n]) => n).join(", "));
