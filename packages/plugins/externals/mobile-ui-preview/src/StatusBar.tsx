import { useEffect, useState } from "react";

function useClock(): string {
	const [now, setNow] = useState(() => new Date());
	useEffect(() => {
		const timer = setInterval(() => setNow(new Date()), 30_000);
		return () => clearInterval(timer);
	}, []);
	const hh = String(now.getHours()).padStart(2, "0");
	const mm = String(now.getMinutes()).padStart(2, "0");
	return `${hh}:${mm}`;
}

function SignalIcon() {
	return (
		<svg viewBox="0 0 18 12" className="h-[11px] w-auto" fill="currentColor" aria-hidden>
			<rect x="0" y="8" width="3" height="4" rx="0.8" />
			<rect x="5" y="5.5" width="3" height="6.5" rx="0.8" />
			<rect x="10" y="3" width="3" height="9" rx="0.8" />
			<rect x="15" y="0.5" width="3" height="11.5" rx="0.8" opacity="0.35" />
		</svg>
	);
}

function WifiIcon() {
	return (
		<svg viewBox="0 0 16 12" className="h-[11px] w-auto" fill="currentColor" aria-hidden>
			<path d="M8 10.6a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8Z" transform="translate(0 -1.8)" />
			<path
				d="M8 6.4c1.6 0 3.05.62 4.13 1.63l-1.2 1.2A4.16 4.16 0 0 0 8 8.2c-1.1 0-2.1.39-2.93 1.03l-1.2-1.2A5.93 5.93 0 0 1 8 6.4Z"
				opacity="0.9"
			/>
			<path
				d="M8 2.6c2.65 0 5.06 1.03 6.86 2.7l-1.2 1.2A8.1 8.1 0 0 0 8 4.4c-2.18 0-4.16.86-5.66 2.1l-1.2-1.2A9.86 9.86 0 0 1 8 2.6Z"
				opacity="0.55"
			/>
		</svg>
	);
}

function BatteryIcon() {
	return (
		<svg viewBox="0 0 25 12" className="h-[11px] w-auto" aria-hidden>
			<rect x="0.5" y="0.5" width="21" height="11" rx="3" fill="none" stroke="currentColor" opacity="0.4" />
			<rect x="2" y="2" width="14" height="8" rx="1.6" fill="currentColor" />
			<path d="M23 4v4c1.1-0.2 1.8-1 1.8-2s-0.7-1.8-1.8-2Z" fill="currentColor" opacity="0.4" />
		</svg>
	);
}

/**
 * 自绘仿真状态栏：iOS / Android 两套样式跟随机型；时间为实时系统时间，
 * 信号/WiFi/电量为静态仿真数据。沉浸式：绝对定位悬浮在屏幕内容最上方
 * （透明背景，白字+阴影保证在任意页面配色上可读），HTML 内容从屏幕最顶部开始。
 */
export function StatusBar({ os, height }: { os: "ios" | "android"; height: number }) {
	const time = useClock();
	const immersive =
		"pointer-events-none absolute inset-x-0 top-0 z-10 select-none text-white [filter:drop-shadow(0_0_2px_rgba(0,0,0,0.55))]";

	if (os === "ios") {
		return (
			<div className={`${immersive} flex items-end justify-between px-[24px] pb-[6px]`} style={{ height }}>
				<span className="min-w-[54px] text-[14px] font-semibold tabular-nums">{time}</span>
				<span className="flex items-center gap-[6px]">
					<SignalIcon />
					<WifiIcon />
					<BatteryIcon />
				</span>
			</div>
		);
	}

	return (
		<div className={`${immersive} flex items-center justify-between px-[14px]`} style={{ height }}>
			<span className="text-[12px] font-medium tabular-nums">{time}</span>
			<span className="flex items-center gap-[5px]">
				<WifiIcon />
				<SignalIcon />
				<BatteryIcon />
			</span>
		</div>
	);
}
