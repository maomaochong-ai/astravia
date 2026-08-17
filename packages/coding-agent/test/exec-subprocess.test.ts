import { execPath } from "node:process";
import { describe, expect, it } from "vitest";
import { runSubprocess, SubprocessAbortError } from "../src/core/tools/exec-subprocess.js";

describe("runSubprocess（可中止子进程）", () => {
	it("正常返回 stdout 与退出码 0", async () => {
		const r = await runSubprocess(execPath, ["-e", "process.stdout.write('hello')"]);
		expect(r.stdout).toBe("hello");
		expect(r.code).toBe(0);
	});

	it("非零退出码：正常 resolve 并带回 code（不 reject）", async () => {
		const r = await runSubprocess(execPath, ["-e", "process.stderr.write('boom');process.exit(3)"]);
		expect(r.code).toBe(3);
		expect(r.stderr).toContain("boom");
	});

	it("abort → 立即 killProcessTree 并抛 SubprocessAbortError（远早于子进程自然结束）", async () => {
		const controller = new AbortController();
		const started = Date.now();
		const p = runSubprocess(execPath, ["-e", "setTimeout(() => {}, 60000)"], { signal: controller.signal });
		setTimeout(() => controller.abort(), 50);
		await expect(p).rejects.toBeInstanceOf(SubprocessAbortError);
		// 应在远小于 60s 内 settle（被杀死，而非空等）
		expect(Date.now() - started).toBeLessThan(5000);
	});

	it("已 abort 的 signal → 直接 reject，不启动进程", async () => {
		const controller = new AbortController();
		controller.abort();
		await expect(
			runSubprocess(execPath, ["-e", "process.exit(0)"], { signal: controller.signal }),
		).rejects.toBeInstanceOf(SubprocessAbortError);
	});

	it("超时 → killProcessTree 并 reject", async () => {
		const started = Date.now();
		await expect(runSubprocess(execPath, ["-e", "setTimeout(() => {}, 60000)"], { timeout: 200 })).rejects.toThrow(
			/timed out/,
		);
		expect(Date.now() - started).toBeLessThan(5000);
	});
});
