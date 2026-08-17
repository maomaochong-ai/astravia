/**
 * 本地 OCR 子进程的全局并发闸。
 *
 * extract_text_from_pdf / extract_text_from_img 各自 execFile 一个 Astravia Desktop
 * 子进程跑本地 OCR（onnxruntime + PP-OCRv5）。多个并发 agent 会话会各起独立 OCR
 * 进程争抢 CPU，故在这里用一个**模块级共享**限制器把同时存在的 OCR 进程数压到上限。
 *
 * 默认并发 1：Astravia OCR CLI 当前共享同一个固定 Chromium userData 目录
 * （astravia-ocr-cli，无 pid 后缀），并发 >1 会因 SingletonLock 冲突/退化，故默认串行最安全。
 * 可经环境变量 ASTRAVIA_KB_OCR_CONCURRENCY 调高（仅当 desktop 侧给 OCR userData 加了
 * 进程隔离后才安全）。限制器惰性初始化，读取调用时刻的环境变量。
 *
 * render_pdf_page 不在此闸内：它 spawn 的是 poppler 的 pdftoppm（轻量、非 Astravia OCR）。
 */

import { createLimiter, type Limiter } from "../concurrency-limit.js";

let limiter: Limiter | null = null;

function ocrLimiter(): Limiter {
	if (!limiter) {
		const raw = Number.parseInt(process.env.ASTRAVIA_KB_OCR_CONCURRENCY ?? "", 10);
		const max = Number.isFinite(raw) && raw >= 1 ? raw : 1;
		limiter = createLimiter(max);
	}
	return limiter;
}

/** 在全局 OCR 并发闸内运行 fn（一次 Astravia OCR 子进程调用）。 */
export function runWithOcrLimit<T>(fn: () => Promise<T>): Promise<T> {
	return ocrLimiter().run(fn);
}
