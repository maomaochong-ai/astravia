import { localPoint } from "@visx/event";
import { Group } from "@visx/group";
import { scaleLinear } from "@visx/scale";
import { AreaClosed, LinePath } from "@visx/shape";
import { TooltipWithBounds, useTooltip } from "@visx/tooltip";
import { useId, useMemo, type JSX, type PointerEvent } from "react";
import { formatCultivationNumber, getCultivationChartUpperBound } from "./cultivationView";
import type { SanctumCultivationView } from "./types";

const chartWidth = 152;
const chartHeight = 92;
const margin = { top: 20, right: 7, bottom: 12, left: 31 };

interface TrendDatum {
	readonly date: string;
	readonly label: string;
	readonly power: number;
	readonly score: number;
}

function getXIndex(datum: TrendDatum, data: readonly TrendDatum[]): number {
	return Math.max(0, data.findIndex((item) => item.date === datum.date));
}

function getNearestDatum(data: readonly TrendDatum[], x: number, xMax: number): TrendDatum {
	if (data.length <= 1) return data[0];
	const ratio = xMax <= 0 ? 0 : x / xMax;
	const index = Math.min(data.length - 1, Math.max(0, Math.round(ratio * (data.length - 1))));
	return data[index];
}

export function XianxiaCultivationTrendChart({
	cultivation,
}: {
	readonly cultivation: SanctumCultivationView;
}): JSX.Element {
	const data = useMemo<readonly TrendDatum[]>(() => {
		if (cultivation.trend.length > 0) return cultivation.trend;
		return [{ date: "today", label: "今日", power: cultivation.score, score: cultivation.score }];
	}, [cultivation.score, cultivation.trend]);
	const {
		hideTooltip,
		showTooltip,
		tooltipData,
		tooltipLeft = 0,
		tooltipOpen,
		tooltipTop = 0,
	} = useTooltip<TrendDatum>();
	const id = useId();
	const areaGradientId = `${id}-area`;
	const glowFilterId = `${id}-glow`;
	const xMax = chartWidth - margin.left - margin.right;
	const yMax = chartHeight - margin.top - margin.bottom;
	const yDomainMax = getCultivationChartUpperBound(Math.max(...data.map((datum) => datum.power), 0));
	const xScale = scaleLinear<number>({
		domain: [0, Math.max(data.length - 1, 1)],
		range: [0, xMax],
	});
	const yScale = scaleLinear<number>({
		domain: [0, yDomainMax],
		range: [yMax, 0],
	});
	const selectedDatum = tooltipOpen && tooltipData ? tooltipData : data[data.length - 1];
	const selectedX = margin.left + xScale(getXIndex(selectedDatum, data));
	const selectedY = margin.top + yScale(selectedDatum.power);
	const ticks = [yDomainMax, yDomainMax * 0.6, 0];

	const handlePointerMove = (event: PointerEvent<SVGRectElement>): void => {
		const point = localPoint(event.currentTarget.ownerSVGElement ?? event.currentTarget, event);
		if (!point) return;
		const localX = Math.min(xMax, Math.max(0, point.x - margin.left));
		const datum = getNearestDatum(data, localX, xMax);
		showTooltip({
			tooltipData: datum,
			tooltipLeft: margin.left + xScale(getXIndex(datum, data)),
			tooltipTop: margin.top + yScale(datum.power),
		});
	};

	return (
		<div className="relative min-w-0">
			<div className="mb-1 text-center text-[12px] font-semibold tracking-[0.08em] text-slate-200/72">
				修为值趋势（近30天）
			</div>
			<svg
				aria-label="近30天修为值趋势"
				className="block h-[92px] w-[152px] max-w-full overflow-visible"
				role="img"
				viewBox={`0 0 ${chartWidth} ${chartHeight}`}
			>
				<defs>
					<linearGradient id={areaGradientId} x1="0" x2="0" y1="0" y2="1">
						<stop offset="0%" stopColor="#d9ddff" stopOpacity="0.34" />
						<stop offset="62%" stopColor="#95a7d8" stopOpacity="0.16" />
						<stop offset="100%" stopColor="#95a7d8" stopOpacity="0" />
					</linearGradient>
					<filter id={glowFilterId} x="-45%" y="-45%" width="190%" height="190%">
						<feGaussianBlur result="blur" stdDeviation="1.7" />
						<feMerge>
							<feMergeNode in="blur" />
							<feMergeNode in="SourceGraphic" />
						</feMerge>
					</filter>
				</defs>
				<Group left={margin.left} top={margin.top}>
					{ticks.map((tick) => {
						const y = yScale(tick);
						return (
							<g key={tick}>
								<line stroke="rgba(210, 221, 245, 0.12)" strokeWidth={1} x1={0} x2={xMax} y1={y} y2={y} />
								<text
									dominantBaseline="middle"
									fill="rgba(226, 232, 240, 0.72)"
									fontSize={11}
									fontWeight={600}
									textAnchor="end"
									x={-7}
									y={y}
								>
									{formatCultivationNumber(tick)}
								</text>
							</g>
						);
					})}
					<line stroke="rgba(210, 221, 245, 0.18)" strokeWidth={1} x1={0} x2={0} y1={0} y2={yMax} />
					{data.length > 1 && (
						<AreaClosed<TrendDatum>
							data={data}
							fill={`url(#${areaGradientId})`}
							x={(datum) => xScale(getXIndex(datum, data))}
							y={(datum) => yScale(datum.power)}
							yScale={yScale}
						/>
					)}
					{data.length > 1 && (
						<LinePath<TrendDatum>
							data={data}
							filter={`url(#${glowFilterId})`}
							stroke="rgba(231, 235, 255, 0.92)"
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							x={(datum) => xScale(getXIndex(datum, data))}
							y={(datum) => yScale(datum.power)}
						/>
					)}
					{tooltipOpen && (
						<line
							pointerEvents="none"
							stroke="rgba(237, 210, 170, 0.5)"
							strokeDasharray="3 3"
							strokeWidth={1}
							x1={selectedX - margin.left}
							x2={selectedX - margin.left}
							y1={0}
							y2={yMax}
						/>
					)}
					<circle
						cx={selectedX - margin.left}
						cy={selectedY - margin.top}
						fill="#fff6d8"
						filter={`url(#${glowFilterId})`}
						pointerEvents="none"
						r={3}
						stroke="#edd2aa"
						strokeWidth={1.5}
					/>
					<rect
						fill="transparent"
						height={yMax}
						onPointerLeave={hideTooltip}
						onPointerMove={handlePointerMove}
						width={xMax}
						x={0}
						y={0}
					/>
				</Group>
			</svg>
			{tooltipOpen && tooltipData && (
				<TooltipWithBounds
					className="pointer-events-none rounded-[6px] border border-[#edd2aa]/55 bg-slate-950/88 px-2 py-1 text-[11px] leading-4 text-slate-100 shadow-[0_4px_12px_rgba(15,23,42,0.36)]"
					left={tooltipLeft}
					offsetLeft={6}
					offsetTop={6}
					style={{
						backgroundColor: "rgba(2, 6, 23, 0.88)",
						borderRadius: "6px",
						boxShadow: "0 4px 12px rgba(15, 23, 42, 0.36)",
						color: "rgb(241, 245, 249)",
						fontSize: "11px",
						lineHeight: "16px",
						padding: "4px 8px",
						pointerEvents: "none",
						position: "absolute",
					}}
					top={tooltipTop}
				>
					<div className="font-semibold text-[#edd2aa]">{tooltipData.label}</div>
					<div>修为 {formatCultivationNumber(tooltipData.power)}</div>
				</TooltipWithBounds>
			)}
		</div>
	);
}
