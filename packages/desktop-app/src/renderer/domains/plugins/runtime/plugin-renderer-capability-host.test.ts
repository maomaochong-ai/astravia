import { describe, expect, it, vi } from "vitest";
import { PluginRendererCapabilityHost } from "./plugin-renderer-capability-host.js";

describe("PluginRendererCapabilityHost", () => {
	it("runs official renderer operations only for active official sessions", () => {
		const host = new PluginRendererCapabilityHost();
		const operation = vi.fn(() => "ok");
		host.bindSession("official-session", {
			id: "official-plugin",
			enabled: true,
			trustLevel: "official",
		});

		expect(host.invokeOfficial("official-session", operation)).toBe("ok");
		expect(operation).toHaveBeenCalledOnce();

		host.closeSession("official-session");
		expect(() => host.invokeOfficial("official-session", operation)).toThrow(
			"Plugin renderer capability session is not active",
		);
	});

	it("denies community and disabled plugin sessions", () => {
		const host = new PluginRendererCapabilityHost();
		host.bindSession("community-session", {
			id: "community-plugin",
			enabled: true,
			trustLevel: "community",
		});
		host.bindSession("disabled-session", {
			id: "disabled-plugin",
			enabled: false,
			trustLevel: "official",
		});

		expect(() => host.invokeOfficial("community-session", () => {})).toThrow(
			"Plugin official renderer capability access denied",
		);
		expect(() => host.invokeOfficial("disabled-session", () => {})).toThrow(
			"Plugin official renderer capability access denied",
		);
	});

	it("revokes the previous renderer session when the same plugin is rebound", () => {
		const host = new PluginRendererCapabilityHost();
		const plugin = { id: "official-plugin", enabled: true, trustLevel: "official" as const };
		host.bindSession("first-session", plugin);
		host.bindSession("second-session", plugin);

		expect(() => host.invokeOfficial("first-session", () => {})).toThrow(
			"Plugin renderer capability session is not active",
		);
		expect(host.invokeOfficial("second-session", () => "ok")).toBe("ok");
	});
});
