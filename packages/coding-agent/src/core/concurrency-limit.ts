/**
 * 最小并发限制器（信号量）。无外部依赖。
 *
 * 用途：
 *   - OCR 工具：限制同时存在的本地 OCR 子进程数，保护 CPU（见 tools/ocr-concurrency.ts）。
 *   - 知识库写页：max=1 即串行互斥，保护轮级共享 PageIndex 的读-改-写（见 knowledge/writer.ts）。
 *   - 加工会话池：限制并发 agent 会话数（桌面轮询器）。
 *
 * run 的 fn 抛错也会经 finally 释放额度，不泄漏。
 */
export interface Limiter {
	/** 在不超过并发上限的前提下运行 fn；超出则排队，额度释放后按 FIFO 出队。 */
	run<T>(fn: () => Promise<T>): Promise<T>;
}

export function createLimiter(max: number): Limiter {
	const limit = Math.max(1, Math.floor(max));
	let active = 0;
	const queue: Array<() => void> = [];

	const pump = (): void => {
		if (active >= limit) return;
		const start = queue.shift();
		if (!start) return;
		active += 1;
		start();
	};

	return {
		run<T>(fn: () => Promise<T>): Promise<T> {
			return new Promise<T>((resolve, reject) => {
				queue.push(() => {
					fn()
						.then(resolve, reject)
						.finally(() => {
							active -= 1;
							pump();
						});
				});
				pump();
			});
		},
	};
}
