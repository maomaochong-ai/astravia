import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadToolDescription } from "../src/core/tools/description.js";
import { TOOL_DESCRIPTIONS } from "../src/core/tools/descriptions-data.js";

const toolsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "core", "tools");

function toolDirsWithDescription(): string[] {
	return readdirSync(toolsDir)
		.filter((entry) => {
			const dir = join(toolsDir, entry);
			if (!statSync(dir).isDirectory()) return false;
			try {
				return readFileSync(join(dir, "description.txt"), "utf-8").trim().length > 0;
			} catch {
				return false;
			}
		})
		.sort();
}

describe("工具描述内联", () => {
	it("每一份 description.txt 都进了生成物", () => {
		// 生成物过期时这里会挂——提醒跑 `bun run generate:descriptions`。
		expect(Object.keys(TOOL_DESCRIPTIONS).sort()).toEqual(toolDirsWithDescription());
	});

	it("生成物内容与源文件逐字一致", () => {
		for (const tool of toolDirsWithDescription()) {
			const source = readFileSync(join(toolsDir, tool, "description.txt"), "utf-8").trim();
			expect(TOOL_DESCRIPTIONS[tool], `${tool} 的描述与源文件不一致`).toBe(source);
		}
	});

	it("拿到的是完整描述而非 fallback", () => {
		const description = loadToolDescription("edit", "SHORT FALLBACK");
		expect(description).not.toBe("SHORT FALLBACK");
		// 这条 CRITICAL 规则此前一直没进 system prompt。
		expect(description).toContain("read");
		expect(description.length).toBeGreaterThan(200);
	});

	it("没有 description.txt 的工具退回 fallback", () => {
		expect(loadToolDescription("task-output", "SHORT FALLBACK")).toBe("SHORT FALLBACK");
		expect(loadToolDescription("does-not-exist", "SHORT FALLBACK")).toBe("SHORT FALLBACK");
	});
});
