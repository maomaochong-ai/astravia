import {
	useCallback,
	useRef,
	useState,
	type JSX,
	type PointerEvent as ReactPointerEvent,
} from "react";
import { cn } from "@astravia/ui";

export interface ProjectsPanelSplitHandleProps {
	onResize: (deltaY: number) => void;
	onResizeEnd?: () => void;
	onResizeStart?: () => void;
}

export function ProjectsPanelSplitHandle({
	onResize,
	onResizeEnd,
	onResizeStart,
}: ProjectsPanelSplitHandleProps): JSX.Element {
	const startYRef = useRef(0);
	const [dragging, setDragging] = useState(false);

	const onPointerDown = useCallback(
		(event: ReactPointerEvent) => {
			event.preventDefault();
			onResizeStart?.();
			startYRef.current = event.clientY;
			setDragging(true);

			const overlay = document.createElement("div");
			overlay.style.position = "fixed";
			overlay.style.inset = "0";
			overlay.style.zIndex = "9999";
			overlay.style.cursor = "row-resize";
			document.body.appendChild(overlay);

			const onPointerMove = (ev: PointerEvent) => {
				const delta = ev.clientY - startYRef.current;
				startYRef.current = ev.clientY;
				onResize(delta);
			};

			const onPointerUp = () => {
				document.removeEventListener("pointermove", onPointerMove);
				document.removeEventListener("pointerup", onPointerUp);
				document.removeEventListener("pointercancel", onPointerUp);
				window.removeEventListener("blur", onPointerUp);
				overlay.remove();
				document.body.style.userSelect = "";
				setDragging(false);
				onResizeEnd?.();
			};

			document.addEventListener("pointermove", onPointerMove);
			document.addEventListener("pointerup", onPointerUp);
			document.addEventListener("pointercancel", onPointerUp);
			window.addEventListener("blur", onPointerUp);
			document.body.style.userSelect = "none";
		},
		[onResize, onResizeEnd, onResizeStart],
	);

	const lineGradient =
		"linear-gradient(to right, transparent, color-mix(in srgb, var(--primary) 28%, transparent) 50%, transparent)";
	const glowGradient =
		"linear-gradient(to right, transparent, color-mix(in srgb, var(--primary) 15%, transparent) 50%, transparent)";
	const idleLineGradient =
		"linear-gradient(to right, transparent, color-mix(in srgb, var(--border) 90%, transparent) 18%, color-mix(in srgb, var(--border) 90%, transparent) 82%, transparent)";
	const fadeStyle = {
		transition: "opacity 380ms cubic-bezier(0.22, 0.61, 0.36, 1)",
		willChange: "opacity",
	} as const;

	return (
		<div
			role="separator"
			aria-orientation="horizontal"
			onPointerDown={onPointerDown}
			className="group/split relative z-20 h-[10px] w-full shrink-0 cursor-row-resize"
		>
			{/* Idle: only while sidebar is hovered */}
			<div
				aria-hidden
				className="pointer-events-none absolute left-1/2 top-1/2 h-px w-[72%] -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover/sidebar:opacity-80"
				style={{ ...fadeStyle, background: idleLineGradient }}
			/>
			<div
				aria-hidden
				className="pointer-events-none absolute left-1/2 top-1/2 z-10 flex h-[5px] w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center gap-[2px] rounded-full bg-muted-foreground/25 opacity-0 transition-opacity duration-300 group-hover/sidebar:opacity-90"
			>
				<span className="h-[2px] w-[2px] shrink-0 rounded-full bg-muted-foreground/60" />
				<span className="h-[2px] w-[2px] shrink-0 rounded-full bg-muted-foreground/60" />
				<span className="h-[2px] w-[2px] shrink-0 rounded-full bg-muted-foreground/60" />
			</div>
			{/* Handle hover / drag: primary affordance on top */}
			<div
				aria-hidden
				className={cn(
					"pointer-events-none absolute left-1/2 top-1/2 h-[6px] w-[40%] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0 blur-[4px] group-hover/split:opacity-100",
					dragging && "opacity-100",
				)}
				style={{ ...fadeStyle, background: glowGradient }}
			/>
			<div
				aria-hidden
				className={cn(
					"pointer-events-none absolute left-1/2 top-1/2 z-[1] h-px w-[60%] -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover/split:opacity-100",
					dragging && "opacity-100",
				)}
				style={{ ...fadeStyle, background: lineGradient }}
			/>
			<div
				aria-hidden
				className={cn(
					"pointer-events-none absolute left-1/2 top-1/2 z-20 flex h-[5px] w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center gap-[2px] rounded-full bg-primary/30 opacity-0 transition-opacity duration-300 group-hover/split:opacity-100",
					dragging && "opacity-100",
				)}
			>
				<span className="h-[2px] w-[2px] shrink-0 rounded-full bg-primary/75" />
				<span className="h-[2px] w-[2px] shrink-0 rounded-full bg-primary/75" />
				<span className="h-[2px] w-[2px] shrink-0 rounded-full bg-primary/75" />
			</div>
		</div>
	);
}
