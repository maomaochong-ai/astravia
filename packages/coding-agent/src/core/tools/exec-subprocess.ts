/**
 * 可中止的本地子进程执行器。
 *
 * promisify(execFile) 拿不到 ChildProcess 句柄，abort 时无法主动 kill，只能空等
 * timeout——会导致被中止的本地工具进程（OCR/PDF 渲染等）残留到超时为止，长期累积
 * 拖垮应用。本工具改用 detached spawn：子进程自成进程组，abort/超时时用
 * killProcessTree(-pid) 一次性收掉整棵进程树（含 Astravia OCR 的 Electron helper 等
 * 孙子进程），不残留。
 *
 * 与 promisify(execFile) 的语义差异：非零退出码不再 reject，而是正常 resolve 并带回
 * code（调用方据此判定失败，同时仍能读到 stdout/stderr——Astravia CLI 把错误 JSON 写在
 * stdout）。仅在 abort / 超时 / 输出超 maxBuffer / spawn 失败 时 reject。
 */

import { spawn } from "node:child_process";
import { killProcessTree } from "../../utils/shell.js";

export interface RunSubprocessOptions {
	/** 中止信号；abort 时立即 killProcessTree 整棵树并 reject SubprocessAbortError。 */
	signal?: AbortSignal;
	/** 超时毫秒；>0 生效，超时同样 killProcessTree 整棵树并 reject。 */
	timeout?: number;
	/** stdout/stderr 合计上限字节；超出即强杀并 reject。默认 32MiB。 */
	maxBuffer?: number;
	/** 子进程环境变量，默认继承当前进程。 */
	env?: NodeJS.ProcessEnv;
}

export interface SubprocessResult {
	stdout: string;
	stderr: string;
	/** 退出码；信号终止时为 null。 */
	code: number | null;
}

/** abort 信号或已 abort 时抛出，调用方据此区分「用户中止」与「进程失败」。 */
export class SubprocessAbortError extends Error {
	constructor() {
		super("Operation aborted");
		this.name = "SubprocessAbortError";
	}
}

const DEFAULT_MAX_BUFFER = 32 * 1024 * 1024;

export function runSubprocess(
	file: string,
	args: string[],
	options: RunSubprocessOptions = {},
): Promise<SubprocessResult> {
	const { signal, timeout, maxBuffer = DEFAULT_MAX_BUFFER, env } = options;
	return new Promise<SubprocessResult>((resolve, reject) => {
		if (signal?.aborted) {
			reject(new SubprocessAbortError());
			return;
		}
		const child = spawn(file, args, {
			// detached：子进程自成进程组，killProcessTree 以 -pid 杀整组（含 helper 孙进程）。
			detached: true,
			stdio: ["ignore", "pipe", "pipe"],
			windowsHide: true,
			env: env ?? process.env,
		});

		let stdout = "";
		let stderr = "";
		let killed = false;
		let aborted = false;
		let timedOut = false;
		let overflow = false;
		let timer: NodeJS.Timeout | undefined;

		const kill = (): void => {
			if (killed) return;
			killed = true;
			if (child.pid) killProcessTree(child.pid);
		};
		const onAbort = (): void => {
			aborted = true;
			kill();
		};

		if (signal) signal.addEventListener("abort", onAbort, { once: true });
		if (timeout && timeout > 0) {
			timer = setTimeout(() => {
				timedOut = true;
				kill();
			}, timeout);
		}

		const append = (buf: Buffer, which: "out" | "err"): void => {
			if (overflow) return;
			const nextLen = (which === "out" ? stdout.length : stderr.length) + buf.length;
			if (nextLen > maxBuffer) {
				overflow = true;
				kill();
				return;
			}
			if (which === "out") stdout += buf.toString("utf8");
			else stderr += buf.toString("utf8");
		};
		child.stdout?.on("data", (d: Buffer) => append(d, "out"));
		child.stderr?.on("data", (d: Buffer) => append(d, "err"));

		const cleanup = (): void => {
			if (timer) clearTimeout(timer);
			if (signal) signal.removeEventListener("abort", onAbort);
		};

		child.on("error", (err) => {
			cleanup();
			if (aborted) reject(new SubprocessAbortError());
			else reject(err);
		});
		child.on("close", (code) => {
			cleanup();
			if (aborted) reject(new SubprocessAbortError());
			else if (timedOut) reject(new Error(`Process timed out after ${timeout}ms`));
			else if (overflow) reject(new Error(`Process output exceeded ${maxBuffer} bytes`));
			else resolve({ stdout, stderr, code });
		});
	});
}
