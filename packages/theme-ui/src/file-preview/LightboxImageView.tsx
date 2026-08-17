import { useCallback, useEffect, useRef, useState, type JSX } from "react";

const MIN_SCALE = 0.2;
const MAX_SCALE = 40;
const WHEEL_FACTOR = 0.0015;
const CLOSE_THRESHOLD = 120;

export interface LightboxImageViewProps {
	src: string;
	error: boolean;
	alt: string;
	errorLabel: string;
	onClose: () => void;
}

/**
 * Lightbox image: wheel zoom, pan when zoomed, swipe-up dismiss at 1x.
 * Host resolves `src` via IPC / URL.
 */
export function LightboxImageView({
	src,
	error,
	alt,
	errorLabel,
	onClose,
}: LightboxImageViewProps): JSX.Element {
	const containerRef = useRef<HTMLDivElement>(null);
	const [scale, setScale] = useState(1);
	const [offset, setOffset] = useState({ x: 0, y: 0 });
	const [dragY, setDragY] = useState(0);
	const [dragging, setDragging] = useState(false);
	const panStartRef = useRef({ x: 0, y: 0, ox: 0, oy: 0 });

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		const onWheel = (e: WheelEvent) => {
			e.preventDefault();
			const rect = container.getBoundingClientRect();
			const cx = e.clientX - rect.left - rect.width / 2;
			const cy = e.clientY - rect.top - rect.height / 2;
			setScale((prev) => {
				const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev - e.deltaY * WHEEL_FACTOR * prev));
				if (next === prev) return prev;
				if (next <= 1) {
					setOffset({ x: 0, y: 0 });
				} else {
					const ratio = next / prev;
					setOffset((o) => ({ x: cx - ratio * (cx - o.x), y: cy - ratio * (cy - o.y) }));
				}
				return next;
			});
		};
		container.addEventListener("wheel", onWheel, { passive: false });
		return () => container.removeEventListener("wheel", onWheel);
	}, []);

	const onPointerDown = useCallback(
		(e: React.PointerEvent) => {
			if (e.button !== 0) return;
			e.preventDefault();
			setDragging(true);
			panStartRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
			(e.target as HTMLElement).setPointerCapture?.(e.pointerId);
		},
		[offset],
	);

	const onPointerMove = useCallback(
		(e: React.PointerEvent) => {
			if (!dragging) return;
			const dx = e.clientX - panStartRef.current.x;
			const dy = e.clientY - panStartRef.current.y;
			if (scale > 1) {
				setOffset({ x: panStartRef.current.ox + dx, y: panStartRef.current.oy + dy });
			} else {
				setDragY(dy);
			}
		},
		[dragging, scale],
	);

	const onPointerUp = useCallback(() => {
		setDragging(false);
		if (scale <= 1) {
			if (dragY < -CLOSE_THRESHOLD) {
				onClose();
			} else {
				setDragY(0);
			}
		}
	}, [scale, dragY, onClose]);

	const tx = offset.x;
	const ty = offset.y + (scale <= 1 ? dragY : 0);
	const opacity = scale <= 1 ? 1 - Math.min(Math.abs(dragY) / 500, 0.8) : 1;

	return (
		<div
			ref={containerRef}
			className="flex h-full w-full items-center justify-center overflow-hidden"
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={onPointerUp}
			onPointerCancel={onPointerUp}
		>
			{error ? (
				<div className="flex flex-col items-center gap-3 text-white/50">
					<span className="icon-[mdi--image-broken-variant] text-[40px]" />
					<span className="text-[13px]">{errorLabel}</span>
				</div>
			) : (
				src && (
					<img
						src={src}
						alt={alt}
						draggable={false}
						onClick={(e) => e.stopPropagation()}
						style={{
							transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
							opacity,
							transition: dragging ? "none" : "transform 0.25s ease-out, opacity 0.25s ease-out",
							cursor: scale > 1 ? (dragging ? "grabbing" : "grab") : "default",
						}}
						className="max-h-[80%] max-w-full select-none object-contain"
					/>
				)
			)}
		</div>
	);
}
