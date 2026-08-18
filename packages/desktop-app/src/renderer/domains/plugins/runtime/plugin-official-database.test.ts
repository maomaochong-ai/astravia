import { afterEach, describe, expect, it, vi } from "vitest";
import { createOfficialDatabaseApi } from "./plugin-official-database.js";

afterEach(() => {
	Reflect.deleteProperty(globalThis, "window");
});

describe("createOfficialDatabaseApi", () => {
	it("uses the plugin capability session and preserves facade defaults", async () => {
		const database = {
			listConnections: vi.fn().mockResolvedValue([]),
			addConnection: vi.fn().mockResolvedValue({ id: "conn-1", name: "local" }),
			testConnection: vi.fn().mockResolvedValue({ tableCount: 3, detail: "ok" }),
			removeConnection: vi.fn().mockResolvedValue(undefined),
		};
		Object.defineProperty(globalThis, "window", {
			configurable: true,
			value: { astravia: { plugins: { internalCapabilities: { database } } } },
		});
		const assertOfficial = vi.fn();
		const api = createOfficialDatabaseApi(assertOfficial, "capability-session");

		await expect(api.list()).resolves.toEqual([]);
		await expect(api.add({ name: "local", dbType: "sqlite", host: "C:/data.db" })).resolves.toEqual({
			id: "conn-1",
			name: "local",
		});
		await expect(api.test({ connectionName: "local" })).resolves.toEqual({ tableCount: 3, detail: "ok" });
		await expect(api.remove("conn-1")).resolves.toBeUndefined();

		expect(assertOfficial).toHaveBeenCalledTimes(4);
		expect(database.listConnections).toHaveBeenCalledWith("capability-session");
		expect(database.addConnection).toHaveBeenCalledWith("capability-session", {
			name: "local",
			dbType: "sqlite",
			host: "C:/data.db",
		});
		expect(database.testConnection).toHaveBeenCalledWith("capability-session", { connectionName: "local" });
		expect(database.removeConnection).toHaveBeenCalledWith("capability-session", "conn-1");
	});
});
