const fs = require("fs");
const s = fs.readFileSync("bun.lock", "utf8");
const m = s.match(/"packages":\s*\{([\s\S]*)\}\s*\}$/);
if (!m) {
  console.log("no packages");
  process.exit(0);
}
const inner = m[1];
const keys = [...inner.matchAll(/^  "([^"]+)":/gm)].map((x) => x[1]);
console.log("total keys:", keys.length);
console.log("first 25:", keys.slice(0, 25).join(", "));
const lucide = keys.filter((k) => k.startsWith("lucide"));
console.log("lucide keys:", lucide.join(" | "));
const ts = keys.filter((k) => k.startsWith("typescript") || k.startsWith("@typescript"));
console.log("typescript keys:", ts.join(" | "));
