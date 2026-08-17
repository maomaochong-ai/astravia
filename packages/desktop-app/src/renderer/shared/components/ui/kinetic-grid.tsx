import { useReducedMotion } from "motion/react";
import type { JSX } from "react";
import { useEffect, useRef } from "react";
import { cn } from "@shared/lib/utils";

/**
 * 动态网格背景（Kinetic Grid，参考 shadcn kinetic-grid）：
 * - 网格由交叉的网格线组成，交叉处绘制小圆点；
 * - 光标靠近时，线条与点被平滑推开（远离指针），形成向指针弯曲的变形；
 * - 点击空白处产生向外扩散的涟漪：波前把线条与点沿径向推出（几何变形），
 *   同时波前附近的线条变亮（亮度渐变亮带），随扩散衰减直至消失；
 * - 颜色读取 CSS 变量 `--primary`（canvas 无法解析 var()，通过 probe 元素取计算色），
 *   主题切换（class / data-theme / data-mode 变化）时自动刷新；
 * - 边缘渐隐用 CSS mask 实现。
 * 遵循 DESIGN.md：颜色不硬编码、线条 1px、reduced-motion 时只画一帧静态网格。
 */
export interface KineticGridProps {
	className?: string;
	/** 网格间距（CSS 像素）。 */
	gridSize?: number;
	/** 光标与涟漪的影响半径（CSS 像素）。 */
	waveRadius?: number;
	/** 涟漪扩散速度（CSS 像素/秒）。 */
	waveSpeed?: number;
}

const DEFAULT_GRID_SIZE = 48;
const DEFAULT_WAVE_RADIUS = 260;
const DEFAULT_WAVE_SPEED = 340;

/** 网格线基础透明度（叠加在 --primary 之上）。 */
const LINE_ALPHA = 0.16;
/** 网格点基础透明度。 */
const DOT_ALPHA = 0.55;
/** 网格点基础半径（CSS 像素）。 */
const DOT_RADIUS = 1.5;
/** 光标推开线条/点的最大位移（CSS 像素）。 */
const CURSOR_PUSH = 22;
/** 涟漪波前推出线条/点的最大位移（CSS 像素）。 */
const WAVE_PUSH = 30;
/** 涟漪作用环的半宽（CSS 像素），波前前后各一半。 */
const WAVE_HALF_WIDTH = 60;
/** 波前亮度增益（线条 alpha 的倍率增量）。 */
const BRIGHT_GAIN = 0.9;
/** 同时存在的最大涟漪数，超出时丢弃最旧的。 */
const MAX_WAVES = 8;

interface Wave {
	x: number;
	y: number;
	age: number;
	radius: number;
	maxRadius: number;
}

interface GridPoint {
	x: number;
	y: number;
}

let probe: HTMLDivElement | null = null;

/** 读取 CSS 变量解析后的 rgb 三元组；失败返回 null。 */
function readTokenRgb(varName: string): [number, number, number] | null {
	if (typeof document === "undefined") {
		return null;
	}
	if (!probe) {
		probe = document.createElement("div");
		probe.style.cssText = "position:absolute;width:0;height:0;visibility:hidden;pointer-events:none";
		document.body.appendChild(probe);
	}
	probe.style.backgroundColor = `var(${varName})`;
	const match = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(getComputedStyle(probe).backgroundColor);
	if (!match) {
		return null;
	}
	return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function toRgba(rgb: [number, number, number], alpha: number): string {
	return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

export function KineticGrid({
	className,
	gridSize = DEFAULT_GRID_SIZE,
	waveRadius = DEFAULT_WAVE_RADIUS,
	waveSpeed = DEFAULT_WAVE_SPEED,
}: KineticGridProps): JSX.Element {
	const containerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const reduceMotion = useReducedMotion();

	useEffect(() => {
		const container = containerRef.current;
		const canvas = canvasRef.current;
		if (!container || !canvas) {
			return;
		}
		const ctx = canvas.getContext("2d");
		if (!ctx) {
			return;
		}

		let width = 0;
		let height = 0;
		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		let rgb = readTokenRgb("--primary") ?? [99, 102, 241];
		let cursor = { x: Number.NEGATIVE_INFINITY, y: Number.NEGATIVE_INFINITY };
		let smoothed = { ...cursor };
		const waves: Wave[] = [];
		let raf = 0;
		let last = performance.now();

		// 网格采样：垂直线（固定 x、y 采样）、水平线（固定 y、x 采样）与交叉点。
		let verticals: GridPoint[][] = [];
		let horizontals: GridPoint[][] = [];
		let dots: GridPoint[] = [];

		const rebuildGrid = (): void => {
			verticals = [];
			horizontals = [];
			dots = [];
			const step = gridSize / 4;
			for (let x = gridSize / 2; x < width; x += gridSize) {
				const line: GridPoint[] = [];
				for (let y = 0; y <= height; y += step) {
					line.push({ x, y });
				}
				verticals.push(line);
			}
			for (let y = gridSize / 2; y < height; y += gridSize) {
				const line: GridPoint[] = [];
				for (let x = 0; x <= width; x += step) {
					line.push({ x, y });
				}
				horizontals.push(line);
			}
			for (let vi = 0; vi < verticals.length; vi++) {
				const vx = verticals[vi][0].x;
				for (let hi = 0; hi < horizontals.length; hi++) {
					const hy = horizontals[hi][0].y;
					dots.push({ x: vx, y: hy });
				}
			}
		};

		const resize = (): void => {
			width = container.clientWidth;
			height = container.clientHeight;
			canvas.width = Math.max(1, Math.round(width * dpr));
			canvas.height = Math.max(1, Math.round(height * dpr));
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			rebuildGrid();
		};

		const toLocal = (clientX: number, clientY: number): { x: number; y: number } => {
			const rect = container.getBoundingClientRect();
			return { x: clientX - rect.left, y: clientY - rect.top };
		};

		/**
		 * 计算采样点在光标与涟漪作用下的位移与亮度。
		 * bright 为 1 表示正常亮度，涟漪波前附近 >1（变亮）。
		 */
		const pointEffect = (
			px: number,
			py: number,
		): { ox: number; oy: number; bright: number } => {
			let ox = 0;
			let oy = 0;
			let bright = 1;

			// 光标：把点从指针处推开（方向远离指针），强度随距离平滑衰减。
			const dc = Math.hypot(px - smoothed.x, py - smoothed.y);
			if (dc < waveRadius && dc > 0.01) {
				const k = 1 - dc / waveRadius;
				const falloff = Math.sin(k * Math.PI) * k;
				ox += ((px - smoothed.x) / dc) * CURSOR_PUSH * falloff;
				oy += ((py - smoothed.y) / dc) * CURSOR_PUSH * falloff;
			}

			// 涟漪：波前附近（前后 WAVE_HALF_WIDTH 范围内）的点沿径向向外推出，
			// 位移带正弦起伏并随扩散衰减；波前附近线条同时变亮形成亮带。
			for (const wave of waves) {
				const dw = Math.hypot(px - wave.x, py - wave.y);
				if (dw < 0.01) {
					continue;
				}
				const edge = dw - wave.radius;
				if (Math.abs(edge) > WAVE_HALF_WIDTH) {
					continue;
				}
				const k = 1 - Math.abs(edge) / WAVE_HALF_WIDTH;
				const fade = 1 - wave.radius / wave.maxRadius;
				const pulse = Math.sin((wave.radius - dw) / 26) * 0.5 + 0.5;
				const strength = WAVE_PUSH * k * (0.35 + 0.65 * pulse) * fade;
				ox += ((px - wave.x) / dw) * strength;
				oy += ((py - wave.y) / dw) * strength;
				bright += BRIGHT_GAIN * k * (0.4 + 0.6 * pulse) * fade;
			}

			return { ox, oy, bright };
		};

		/** 绘制一条采样折线：按亮度相近合并连续段，避免逐点切换 strokeStyle。 */
		const strokeLine = (points: GridPoint[]): void => {
			if (points.length < 2) {
				return;
			}
			// 计算所有采样点的位移与亮度。
			const samples: { x: number; y: number; bright: number }[] = new Array(points.length);
			for (let i = 0; i < points.length; i++) {
				const p = points[i];
				const { ox, oy, bright } = pointEffect(p.x, p.y);
				samples[i] = { x: p.x + ox, y: p.y + oy, bright };
			}
			// 亮度相近的相邻段合并为一条路径。
			let segStart = 0;
			let segBright = samples[0].bright;
			const flush = (end: number): void => {
				ctx.strokeStyle = toRgba(rgb, LINE_ALPHA * segBright);
				ctx.beginPath();
				ctx.moveTo(samples[segStart].x, samples[segStart].y);
				for (let i = segStart + 1; i < end; i++) {
					ctx.lineTo(samples[i].x, samples[i].y);
				}
				ctx.stroke();
			};
			for (let i = 1; i < samples.length; i++) {
				if (Math.abs(samples[i].bright - segBright) > 0.07) {
					flush(i);
					segStart = i;
					segBright = samples[i].bright;
				}
			}
			flush(samples.length);
		};

		const draw = (): void => {
			const now = performance.now();
			const dt = Math.min((now - last) / 1000, 0.05);
			last = now;

			// 光标平滑跟随。
			smoothed.x += (cursor.x - smoothed.x) * 0.18;
			smoothed.y += (cursor.y - smoothed.y) * 0.18;

			// 涟漪推进与回收。
			for (let i = waves.length - 1; i >= 0; i--) {
				const wave = waves[i];
				wave.age += dt;
				wave.radius = wave.age * waveSpeed;
				if (wave.radius > wave.maxRadius) {
					waves.splice(i, 1);
				}
			}

			ctx.clearRect(0, 0, width, height);
			ctx.lineWidth = 1;

			for (let i = 0; i < verticals.length; i++) {
				strokeLine(verticals[i]);
			}
			for (let i = 0; i < horizontals.length; i++) {
				strokeLine(horizontals[i]);
			}

			// 交叉点。
			ctx.fillStyle = toRgba(rgb, DOT_ALPHA);
			for (let i = 0; i < dots.length; i++) {
				const d = dots[i];
				const { ox, oy, bright } = pointEffect(d.x, d.y);
				const r = DOT_RADIUS * (1 + 0.8 * (bright - 1));
				ctx.beginPath();
				ctx.arc(d.x + ox, d.y + oy, r, 0, Math.PI * 2);
				ctx.fill();
			}
		};

		const loop = (): void => {
			draw();
			raf = requestAnimationFrame(loop);
		};

		resize();
		const resizeObserver = new ResizeObserver(resize);
		resizeObserver.observe(container);

		const refreshColors = (): void => {
			rgb = readTokenRgb("--primary") ?? rgb;
		};
		const themeObserver = new MutationObserver(refreshColors);
		themeObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["class", "style", "data-theme", "data-mode"],
		});

		const onPointerMove = (event: PointerEvent): void => {
			cursor = toLocal(event.clientX, event.clientY);
		};
		const onPointerDown = (event: PointerEvent): void => {
			if (event.button !== 0) {
				return;
			}
			const target = event.target as Element | null;
			if (
				target &&
				typeof target.closest === "function" &&
				target.closest("button, input, textarea, select, a, [role='button'], [contenteditable='true']")
			) {
				return;
			}
			const local = toLocal(event.clientX, event.clientY);
			waves.push({
				x: local.x,
				y: local.y,
				age: 0,
				radius: 0,
				maxRadius: Math.max(width, height) * 0.65,
			});
			if (waves.length > MAX_WAVES) {
				waves.shift();
			}
		};
		const onPointerLeave = (): void => {
			cursor = { x: Number.NEGATIVE_INFINITY, y: Number.NEGATIVE_INFINITY };
		};

		const cleanup = (): void => {
			cancelAnimationFrame(raf);
			resizeObserver.disconnect();
			themeObserver.disconnect();
			window.removeEventListener("pointermove", onPointerMove);
			window.removeEventListener("pointerdown", onPointerDown);
			window.removeEventListener("pointerleave", onPointerLeave);
		};

		if (reduceMotion) {
			// 静态网格一帧，不注册动画与指针反馈。
			draw();
			return cleanup;
		}

		window.addEventListener("pointermove", onPointerMove, { passive: true });
		window.addEventListener("pointerdown", onPointerDown, { passive: true });
		window.addEventListener("pointerleave", onPointerLeave, { passive: true });

		raf = requestAnimationFrame(loop);
		return cleanup;
	}, [reduceMotion, gridSize, waveRadius, waveSpeed]);

	return (
		<div
			ref={containerRef}
			aria-hidden="true"
			className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
			style={{
				maskImage:
					"radial-gradient(ellipse 80% 75% at 50% 45%, rgba(0,0,0,0.9) 20%, rgba(0,0,0,0.45) 55%, transparent 100%)",
				WebkitMaskImage:
					"radial-gradient(ellipse 80% 75% at 50% 45%, rgba(0,0,0,0.9) 20%, rgba(0,0,0,0.45) 55%, transparent 100%)",
			}}
		>
			<canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
		</div>
	);
}
