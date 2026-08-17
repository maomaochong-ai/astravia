import { useEffect, useRef, type JSX } from "react";
import confetti from "canvas-confetti";

export interface AchievementPromotionConfettiProps {
	triggerToken: number;
	colors?: readonly string[];
}

const DEFAULT_COLORS = ["#f4d58a", "#d79a3b", "#b91c1c", "#f5e6c8"];

export function AchievementPromotionConfetti({
	triggerToken,
	colors = DEFAULT_COLORS,
}: AchievementPromotionConfettiProps): JSX.Element {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const confettiRef = useRef<ReturnType<typeof confetti.create> | null>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const instance = confetti.create(canvas, {
			disableForReducedMotion: true,
			resize: true,
			useWorker: false,
		});
		confettiRef.current = instance;
		return () => {
			instance.reset();
			confettiRef.current = null;
		};
	}, []);

	useEffect(() => {
		if (triggerToken === 0) return;
		const instance = confettiRef.current;
		if (!instance) return;

		const sharedOptions: confetti.Options = {
			colors: [...colors],
			decay: 0.94,
			disableForReducedMotion: true,
			gravity: 0.72,
			particleCount: 64,
			scalar: 0.9,
			shapes: ["square"],
			spread: 58,
			startVelocity: 46,
			ticks: 240,
		};
		void instance({
			...sharedOptions,
			angle: 58,
			drift: 0.08,
			origin: { x: 0.16, y: 0.48 },
		});
		void instance({
			...sharedOptions,
			angle: 122,
			drift: -0.08,
			origin: { x: 0.84, y: 0.48 },
		});
	}, [triggerToken, colors]);

	return (
		<canvas
			ref={canvasRef}
			aria-hidden="true"
			className="pointer-events-none absolute inset-0 h-full w-full"
		/>
	);
}
