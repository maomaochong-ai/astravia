import { describe, expect, it } from "vitest";
import { shouldShowDbxAccessGuide } from "./dbx-access-guide.js";

describe("shouldShowDbxAccessGuide（对话带表但 AI 访问关闭时提示）", () => {
	it("带表目标 + 开关关 → 提示", () => {
		expect(shouldShowDbxAccessGuide({ connection: "local", table: "users" }, false)).toBe(true);
	});

	it("带表目标 + 开关开 → 不提示", () => {
		expect(shouldShowDbxAccessGuide({ connection: "local", table: "users" }, true)).toBe(false);
	});

	it("无表目标 + 开关关 → 不提示", () => {
		expect(shouldShowDbxAccessGuide(undefined, false)).toBe(false);
		expect(shouldShowDbxAccessGuide(null, false)).toBe(false);
	});

	it("无表目标 + 开关开 → 不提示", () => {
		expect(shouldShowDbxAccessGuide(undefined, true)).toBe(false);
	});

	it("表名为空 → 不提示（缺 table 不算有效目标）", () => {
		expect(shouldShowDbxAccessGuide({ connection: "local", table: "" }, false)).toBe(false);
	});
});
