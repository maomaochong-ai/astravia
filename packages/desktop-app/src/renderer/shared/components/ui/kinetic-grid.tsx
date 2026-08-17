import { useReducedMotion } from "motion/react";
import type { JSX } from "react";
import { useEffect, useRef } from "react";
import { cn } from "@shared/lib/utils";

/**
 * 动态网格背景（Kinetic Grid）：
 * - 网格线向光标方向平滑扭曲；
 * - 点击空白处产生向外扩散的涟漪，线随波纹起伏；
 * - 颜色读取 CSS 变量 `--primary`（canvas 无法解析 var()，通过 probe 元素取计算色），
 *   主题切换（class / data-theme / data-mode 变化）时自动刷新；
 * - 边缘渐隐用 CSS mask 实现，避免逐段切换 strokeStyle 影响性能。
 * 遵循 DESIGN.md：线条 1px、颜色不硬编码、reduced-motion 时只画静态网格。
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

const DEFAULT_GRID_SIZE = 50;
const DEFAULT_WAVE_RADIUS = 220;
const DEFAULT_WAVE_SPEED = 240;

/** 网格线主色透明度（接近静态纹理的 7%）。 */
const LINE_ALPHA = 0.08;

interface Wave {
	x: number;
	y: number;
	age: number;
	radius: number;
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

		// 光标位置（容器内坐标）；平滑跟随值只在动画循环里推进。
		let cursor = { x: Number.NEGATIVE_INFINITY, y: Number.NEGATIVE_INFINITY };
		let smoothed = { ...cursor };
		const waves: Wave[] = [];
		let raf = 0;
		let last = performance.now();

		const resize = (): void => {
			width = container.clientWidth;
			height = container.clientHeight;
			canvas.width = Math.max(1, Math.round(width * dpr));
			canvas.height = Math.max(1, Math.round(height * dpr));
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		};

		const toLocal = (clientX: number, clientY: number): { x: number; y: number } => {
			const rect = container.getBoundingClientRect();
			return { x: clientX - rect.left, y: clientY - rect.top };
		};

		// 单点偏移量：光标扭曲 + 所有涟漪的波纹，叠加在垂直方向（横线上下、竖线左右）。
		const pointOffset = (px: number, py: number): number => {
			let offset = 0;
			const dc = Math.hypot(px - smoothed.x, py - smoothed.y);
			if (dc < waveRadius) {
				const k = 1 - dc / waveRadius;
				offset += Math.sin(k * Math.PI) * 3 * k;
			}
			for (const wave of waves) {
				const dw = Math.hypot(px - wave.x, py - wave.y);
				if (dw < wave.radius) {
					const k = 1 - dw / wave.radius;
					offset += Math.sin(dw / 40 - wave.age * 5) * 5 * k * k;
				}
			}
			return offset;
		};

		const draw = (): void => {
			const now = performance.now();
			const dt = Math.min((now - last) / 1000, 0.05);
			last = now;

			smoothed.x += (cursor.x - smoothed.x) * 0.18;
			smoothed.y += (cursor.y - smoothed.y) * 0.18;

			for (let i = waves.length - 1; i >= 0; i--) {
				const wave = waves[i];
				wave.age += dt;
				wave.radius = wave.age * waveSpeed;
				if (wave.radius > Math.max(width, height) * 0.6) {
					waves.splice(i, 1);
				}
			}

			ctx.clearRect(0, 0, width, height);
			ctx.strokeStyle = toRgba(rgb, LINE_ALPHA);
			ctx.lineWidth = 1;

			const step = gridSize / 4;
			// 竖线：x 固定，沿 y 采样，扭曲偏移加在 x 上。
			for (let x = gridSize; x < width; x += gridSize) {
				ctx.beginPath();
				for (let y = 0; y <= height; y += step) {
					const px = x + pointOffset(x, y);
					if (y === 0) {
						ctx.moveTo(px, y);
					} else {
						ctx.lineTo(px, y);
					}
				}
				ctx.stroke();
			}
			// 横线：y 固定，沿 x 采样，扭曲偏移加在 y 上。
			for (let y = gridSize; y < height; y += gridSize) {
				ctx.beginPath();
				for (let x = 0; x <= width; x += step) {
					const py = y + pointOffset(x, y);
					if (x === 0) {
						ctx.moveTo(x, py);
					} else {
						ctx.lineTo(x, py);
					}
				}
				ctx.stroke();
			}
		};

		const loop = (): void => {
			draw();
			raf = requestAnimationFrame(loop);
		};

		resize();
		const resizeObserver = new ResizeObserver(resize);
		resizeObserver.observe(container);

		// 主题切换（亮/暗、mono、xianxia 等）时刷新网格颜色。
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
			waves.push({ x: local.x, y: local.y, age: 0, radius: 0 });
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
			className={cn("absolute inset-0 overflow-hidden", className)}
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
