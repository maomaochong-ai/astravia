import { afterEach, describe, expect, it } from "vitest";
import { BackgroundTaskManager } from "../src/core/background-tasks/index.js";
import { createBashTool } from "../src/core/tools/bash/index.js";

function getText(result: { content?: Array<{ type: string; text?: string }> }): string {
	return (
		result.content
			?.filter((c) => c.type === "text")
			.map((c) => c.text ?? "")
			.join("\n") || ""
	);
}

describe("bash block_until auto-promote", () => {
	const managers: BackgroundTaskManager[] = [];

	afterEach(() => {
		for (const m of managers) {
			m.killAll();
			m.clearFinished();
		}
		managers.length = 0;
	});

	function makeTool(blockUntilSec = 1) {
		const backgroundTasks = new BackgroundTaskManager();
		managers.push(backgroundTasks);
		return createBashTool(process.cwd(), { backgroundTasks, blockUntilSec });
	}

	it("returns inline when command exits before soft wait", async () => {
		const bash = makeTool(2);
		const result = await bash.execute("t1", { command: "echo promote-inline" });
		expect(getText(result)).toContain("promote-inline");
		expect(result.details?.backgroundTaskId).toBeUndefined();
		expect(result.details?.autoPromoted).toBeUndefined();
	});

	it("auto-promotes long-running command after soft wait", async () => {
		const bash = makeTool(1);
		const result = await bash.execute("t2", { command: "sleep 30" });
		const text = getText(result);
		expect(text).toMatch(/auto-promoted to background task b\d+/);
		expect(result.details?.autoPromoted).toBe(true);
		expect(result.details?.backgroundTaskId).toMatch(/^b\d+$/);

		const task = managers[0]!.get(result.details!.backgroundTaskId!);
		expect(task?.status).toBe("running");
	}, 15_000);

	it("hard-kills on explicit timeout without promoting", async () => {
		const bash = makeTool(5);
		await expect(bash.execute("t3", { command: "sleep 30", timeout: 1 })).rejects.toThrow(/timed out/i);
	}, 15_000);

	it("run_in_background still returns immediately", async () => {
		const bash = makeTool(5);
		const started = Date.now();
		const result = await bash.execute("t4", {
			command: "sleep 30",
			run_in_background: true,
		});
		const elapsed = Date.now() - started;
		expect(elapsed).toBeLessThan(2000);
		expect(result.details?.backgroundTaskId).toMatch(/^b\d+$/);
		expect(getText(result)).toMatch(/background/i);
	}, 10_000);

	it("without background manager, applies soft wait as hard timeout", async () => {
		const bash = createBashTool(process.cwd(), { blockUntilSec: 1 });
		await expect(bash.execute("t5", { command: "sleep 30" })).rejects.toThrow(/timed out/i);
	}, 15_000);

	it("task_stop can kill an auto-promoted process", async () => {
		const bash = makeTool(1);
		const result = await bash.execute("t6", { command: "sleep 60" });
		const id = result.details?.backgroundTaskId;
		expect(id).toBeTruthy();
		expect(managers[0]!.kill(id!)).toBe(true);
		// allow close handler to settle
		await new Promise((r) => setTimeout(r, 200));
		const snap = managers[0]!.get(id!);
		expect(snap?.status === "killed" || snap?.status === "failed" || snap?.status === "completed").toBe(true);
	}, 15_000);
});
