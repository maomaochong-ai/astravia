import { describe, expect, it } from "vitest";
import {
	buildPluginMcpRuntimeName,
	fingerprintPluginMcpServers,
	isPluginMcpRuntimeName,
	normalizePluginMcpNameSegment,
} from "../src/core/mcp/plugin-mcp.js";

describe("plugin MCP naming", () => {
	it("normalizes underscores and punctuation to kebab-case", () => {
		expect(normalizePluginMcpNameSegment("cowart_mcp")).toBe("cowart-mcp");
		expect(normalizePluginMcpNameSegment("My Plugin")).toBe("my-plugin");
		expect(normalizePluginMcpNameSegment("--foo--bar--")).toBe("foo-bar");
	});

	it("builds runtime names without underscores", () => {
		const name = buildPluginMcpRuntimeName("cowart", "cowart_mcp");
		expect(name).toBe("plugin-cowart-cowart-mcp");
		expect(name.includes("_")).toBe(false);
		expect(isPluginMcpRuntimeName(name)).toBe(true);
	});

	it("rejects empty segments", () => {
		expect(() => normalizePluginMcpNameSegment("___")).toThrow();
	});

	it("fingerprints are order-independent", () => {
		const a = fingerprintPluginMcpServers([
			{ runtimeName: "plugin-a-one", config: { command: "node", args: ["a"] } },
			{ runtimeName: "plugin-b-two", config: { command: "node", args: ["b"] } },
		]);
		const b = fingerprintPluginMcpServers([
			{ runtimeName: "plugin-b-two", config: { command: "node", args: ["b"] } },
			{ runtimeName: "plugin-a-one", config: { command: "node", args: ["a"] } },
		]);
		expect(a).toBe(b);
		expect(fingerprintPluginMcpServers([])).toBe("none");
	});

	it("fingerprints change when config changes", () => {
		const base = fingerprintPluginMcpServers([
			{ runtimeName: "plugin-a-one", config: { command: "node", args: ["a"] } },
		]);
		const changed = fingerprintPluginMcpServers([
			{ runtimeName: "plugin-a-one", config: { command: "node", args: ["b"] } },
		]);
		expect(base).not.toBe(changed);
	});
});
