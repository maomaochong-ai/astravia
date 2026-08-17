import { describe, expect, it } from "vitest";
import { PLUGIN_CAPABILITY_PERMISSIONS, PluginCapabilityAdapter } from "../../src/adapters/plugin/index.js";
import { CAPABILITY_ERROR_CODES } from "../../src/contracts.js";
import { RecordingAccessFactory } from "./helpers/recording-access-factory.js";

describe("PluginCapabilityAdapter session lifecycle", () => {
	it("checks current permissions on every invocation", () => {
		const access = new RecordingAccessFactory();
		let permissions: readonly string[] = [PLUGIN_CAPABILITY_PERMISSIONS.FILESYSTEM_READ];
		const adapter = new PluginCapabilityAdapter(access, {
			isOfficialPlugin: () => false,
			resolvePermissions: () => permissions,
		});
		const sessionId = adapter.openSession("revocable");

		permissions = [];

		expect(() => adapter.readFile(sessionId, "C:/project/file.txt")).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.ACCESS_DENIED }),
		);
	});

	it("revokes the previous session when the same plugin is opened again", () => {
		const access = new RecordingAccessFactory();
		const adapter = new PluginCapabilityAdapter(access, {
			isOfficialPlugin: () => false,
			resolvePermissions: () => [PLUGIN_CAPABILITY_PERMISSIONS.FILESYSTEM_READ],
		});
		const firstSessionId = adapter.openSession("reloadable");
		const secondSessionId = adapter.openSession("reloadable");

		expect(() => adapter.readFile(firstSessionId, "C:/project/file.txt")).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.SESSION_REVOKED }),
		);
		expect(() => adapter.readFile(secondSessionId, "C:/project/file.txt")).not.toThrow();

		adapter.closeSession(secondSessionId);
		expect(() => adapter.readFile(secondSessionId, "C:/project/file.txt")).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.SESSION_REVOKED }),
		);
	});
});
