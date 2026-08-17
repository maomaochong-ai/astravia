import { afterEach, describe, expect, it } from "vitest";
import { createOfficialNavigationApi } from "./plugin-official-navigation.js";
import { pluginRendererCapabilityHost } from "./plugin-renderer-capability-host.js";

const SESSION_ID = "navigation-session";

afterEach(() => {
	pluginRendererCapabilityHost.closeSession(SESSION_ID);
});

describe("createOfficialNavigationApi", () => {
	it("routes catalog and resolution through the bound renderer session", () => {
		pluginRendererCapabilityHost.bindSession(SESSION_ID, {
			id: "navigation-plugin",
			enabled: true,
			trustLevel: "official",
		});
		const navigation = createOfficialNavigationApi(SESSION_ID);

		expect(navigation.help()).toHaveProperty("type", "help");
		expect(navigation.resolveOpen({ target: "plugins" })).toMatchObject({
			hashPath: "/abilities",
			resolved: { kind: "page", id: "plugins" },
		});

		pluginRendererCapabilityHost.closeSession(SESSION_ID);
		expect(() => navigation.help()).toThrow("Plugin renderer capability session is not active");
	});
});
