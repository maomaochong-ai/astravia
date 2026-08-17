import type { JSX } from "react";

export function NewSessionBackground(): JSX.Element {
	return (
		<>
			{/* Primary grid texture, faded toward edges */}
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0"
				style={{
					backgroundImage:
						"linear-gradient(to right, color-mix(in srgb, var(--primary) 7%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--primary) 7%, transparent) 1px, transparent 1px)",
					backgroundSize: "32px 32px",
					backgroundPosition: "center center",
					maskImage:
						"radial-gradient(ellipse 70% 60% at 50% 45%, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.6) 50%, transparent 100%)",
					WebkitMaskImage:
						"radial-gradient(ellipse 70% 60% at 50% 45%, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.6) 50%, transparent 100%)",
				}}
			/>

			{/* Ambient glow */}
			<div className="pointer-events-none absolute inset-0">
				<div
					className="absolute left-1/2 top-[30%] h-[440px] w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.1]"
					style={{
						background: "radial-gradient(circle, var(--primary) 0%, transparent 70%)",
					}}
				/>
			</div>
		</>
	);
}
