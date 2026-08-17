import { describe, expect, it, vi } from "vitest";
import type { DesktopConfig } from "../config/desktop-config-store.js";
import { ProjectService } from "./project-service.js";

function createFixture(initial?: Partial<DesktopConfig>) {
	let config: DesktopConfig = {
		projects: [],
		archivedProjects: [],
		workspacePath: "C:\\workspace",
		defaultExecutionMode: "full-access",
		...initial,
	};
	const createDirectory = vi.fn(async () => {});
	const allowProjectRoot = vi.fn();
	const service = new ProjectService({
		allowProjectRoot,
		createDirectory,
		readConfig: async () => structuredClone(config),
		writeConfig: async (next) => {
			config = structuredClone(next);
		},
	});
	return {
		allowProjectRoot,
		createDirectory,
		getConfig: () => config,
		service,
	};
}

describe("ProjectService", () => {
	it("creates a project under the configured workspace and registers its root", async () => {
		const fixture = createFixture();

		await expect(fixture.service.create("demo")).resolves.toEqual({
			path: "C:\\workspace\\demo",
			name: "demo",
		});
		expect(fixture.createDirectory).toHaveBeenCalledWith("C:\\workspace\\demo");
		expect(fixture.allowProjectRoot).toHaveBeenCalledWith("C:\\workspace\\demo");
		expect(fixture.getConfig().projects).toEqual([{ path: "C:\\workspace\\demo", name: "demo" }]);
	});

	it("rejects invalid project names before creating a directory", async () => {
		const fixture = createFixture();

		await expect(fixture.service.create("../escape")).rejects.toThrow("Invalid project name.");
		expect(fixture.createDirectory).not.toHaveBeenCalled();
	});

	it("moves projects between active and archived lists without changing disk data", async () => {
		const fixture = createFixture({
			projects: [{ path: "C:\\workspace\\demo", name: "demo" }],
		});

		await fixture.service.archive("C:\\workspace\\demo");
		expect(fixture.getConfig().projects).toEqual([]);
		expect(fixture.getConfig().archivedProjects).toEqual([{ path: "C:\\workspace\\demo", name: "demo" }]);

		await fixture.service.unarchive("C:\\workspace\\demo");
		expect(fixture.getConfig().projects).toEqual([{ path: "C:\\workspace\\demo", name: "demo" }]);
		expect(fixture.getConfig().archivedProjects).toEqual([]);
	});

	it("removes a project from the sidebar without deleting its directory", async () => {
		const fixture = createFixture({
			archivedProjects: [{ path: "C:\\workspace\\demo", name: "demo" }],
		});

		await fixture.service.remove("C:\\workspace\\demo");

		expect(fixture.getConfig().archivedProjects).toEqual([]);
		expect(fixture.createDirectory).not.toHaveBeenCalled();
	});
});
