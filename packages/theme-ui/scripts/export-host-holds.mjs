import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const deferrals = JSON.parse(readFileSync(path.join(repoRoot, "docs/theme/ui/deferrals.json"), "utf8"));
const holds = [];
for (const [k, v] of Object.entries(deferrals)) {
	const kind = typeof v === "string" ? "permanent_desktop" : v.kind;
	if (kind !== "host_primitive_hold") continue;
	const m = k.match(/domains\/([^/]+)/) || k.match(/shared\/([^/]+)/);
	holds.push({
		path: k,
		domain: m ? m[1] : "other",
		reason: typeof v === "string" ? v : v.reason || "",
	});
}
holds.sort((a, b) => a.domain.localeCompare(b.domain) || a.path.localeCompare(b.path));
const byDomain = {};
for (const h of holds) {
	byDomain[h.domain] = byDomain[h.domain] || [];
	byDomain[h.domain].push(h.path);
}
const out = { total: holds.length, byDomain, holds };
const dest = path.join(repoRoot, "docs/theme/ui/host-primitive-hold-list.json");
writeFileSync(dest, JSON.stringify(out, null, 2) + "\n");
console.log("wrote", dest, "total", holds.length);
for (const [d, list] of Object.entries(byDomain).sort()) {
	console.log(`${d}\t${list.length}`);
}
