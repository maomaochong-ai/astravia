import type { JSX } from "react";
import { useMemo, useRef, useState } from "react";
import { cn } from "./utils";

export interface SliderProps {
	className?: string;
	value?: number[];
	defaultValue?: number[];
	min?: number;
	max?: number;
	step?: number;
	disabled?: boolean;
	"aria-label"?: string;
	onValueChange?: (value: number[]) => void;
	onValueCommit?: (value: number[]) => void;
}

export function Slider({
	className,
	value,
	defaultValue,
	min = 0,
	max = 100,
	step = 1,
	disabled,
	"aria-label": ariaLabel,
	onValueChange,
	onValueCommit,
}: SliderProps): JSX.Element {
	const [internalValue, setInternalValue] = useState(() => defaultValue?.[0] ?? value?.[0] ?? min);
	const [dragging, setDragging] = useState(false);
	const [focused, setFocused] = useState(false);
	const draggingRef = useRef(false);
	const current = value?.[0] ?? internalValue;
	const percent = useMemo(() => {
		if (max <= min) return 0;
		return Math.min(100, Math.max(0, ((current - min) / (max - min)) * 100));
	}, [current, min, max]);

	const changeValue = (next: number): number => {
		const clamped = Math.min(max, Math.max(min, next));
		setInternalValue(clamped);
		onValueChange?.([clamped]);
		return clamped;
	};

	const updateFromPointer = (element: HTMLDivElement, clientX: number): number | undefined => {
		const rect = element.getBoundingClientRect();
		if (rect.width <= 0) return undefined;
		const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
		const raw = min + ratio * (max - min);
		const stepped = min + Math.round((raw - min) / step) * step;
		const decimals = step.toString().split(".")[1]?.length ?? 0;
		return changeValue(Number(stepped.toFixed(decimals)));
	};

	return (
		<div
			data-slot="slider"
			data-disabled={disabled ? "" : undefined}
			onPointerDown={(event) => {
				if (disabled || event.button !== 0) return;
				event.preventDefault();
				draggingRef.current = true;
				setDragging(true);
				event.currentTarget.setPointerCapture(event.pointerId);
				updateFromPointer(event.currentTarget, event.clientX);
			}}
			onPointerMove={(event) => {
				if (!draggingRef.current) return;
				updateFromPointer(event.currentTarget, event.clientX);
			}}
			onPointerUp={(event) => {
				if (!draggingRef.current) return;
				const next = updateFromPointer(event.currentTarget, event.clientX);
				draggingRef.current = false;
				setDragging(false);
				event.currentTarget.releasePointerCapture(event.pointerId);
				onValueCommit?.([next ?? current]);
			}}
			onPointerCancel={() => {
				draggingRef.current = false;
				setDragging(false);
			}}
			className={cn(
				"relative flex h-5 w-full cursor-pointer touch-none select-none items-center data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
				className,
			)}
		>
			<div
				data-slot="slider-track"
				className="absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-muted-foreground/20"
			>
				<div
					data-slot="slider-range"
					className="absolute h-full bg-primary"
					style={{ left: 0, width: `${percent}%` }}
				/>
			</div>
			<div
				data-slot="slider-thumb"
				className={cn(
					"pointer-events-none absolute top-1/2 block w-1 shrink-0 rounded-full bg-primary outline-none ring-2 ring-background transition-[box-shadow,height] before:absolute before:-inset-x-2 before:inset-y-0 before:content-['']",
					dragging ? "h-5 ring-4" : "h-4",
					focused && !dragging ? "ring-[3px]" : undefined,
				)}
				style={{ left: `${percent}%`, transform: "translate(-50%, -50%)" }}
			/>
			<input
				type="range"
				value={current}
				min={min}
				max={max}
				step={step}
				disabled={disabled}
				aria-label={ariaLabel}
				onChange={(event) => changeValue(Number(event.currentTarget.value))}
				onPointerUp={(event) => onValueCommit?.([Number(event.currentTarget.value)])}
				onFocus={() => setFocused(true)}
				onBlur={() => setFocused(false)}
				className="absolute inset-0 h-full w-full cursor-grab opacity-0 active:cursor-grabbing disabled:cursor-not-allowed"
			/>
		</div>
	);
}
