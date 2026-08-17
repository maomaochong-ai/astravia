import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const deferralsPath = path.join(repoRoot, "docs/theme/ui/deferrals.json");
const HOST =
	/components\/ui\/(dialog|drawer|popover|button|dropdown-menu|select|switch|textarea|input)/i;

const d = JSON.parse(readFileSync(deferralsPath, "utf8"));
let removed = 0;
for (const [p, v] of Object.entries(d)) {
	if (v.kind !== "host_primitive_hold") continue;
	const abs = path.join(repoRoot, p);
	if (!existsSync(abs)) {
		delete d[p];
		removed++;
		console.log("removed missing", p);
		continue;
	}
	const t = readFileSync(abs, "utf8");
	const withoutType = t.replace(/import\s+type\s+[\s\S]*?from\s+["'][^"']+["']\s*;?/g, "");
	const importBlocks = withoutType.match(/import\s+(?!type\b)[\s\S]*?from\s+["'][^"']+["']/g) || [];
	let hasHost = false;
	for (const b of importBlocks) {
		if (HOST.test(b) || /from\s+["']@?radix-ui\//.test(b) || /from\s+["']radix-ui["']/.test(b)) {
			hasHost = true;
			break;
		}
	}
	if (!hasHost) {
		delete d[p];
		removed++;
		console.log("removed stale hold", p);
	}
}
writeFileSync(deferralsPath, `${JSON.stringify(d, null, "\t")}\n`);
console.log(
	"removed",
	removed,
	"holds left",
	Object.values(d).filter((v) => v.kind === "host_primitive_hold").length,
);
