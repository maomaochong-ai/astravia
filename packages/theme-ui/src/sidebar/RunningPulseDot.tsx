import type { JSX } from "react";

export function RunningPulseDot(): JSX.Element {
	return (
		<span className="pointer-events-none absolute -right-0.5 -top-0.5 flex h-2 w-2 items-center justify-center">
			<span className="project-running-ping absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
			<span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
		</span>
	);
}
