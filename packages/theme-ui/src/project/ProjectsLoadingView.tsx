import type { JSX } from "react";

export function ProjectsLoadingView(): JSX.Element {
	return (
		<div className="flex min-h-0 flex-1 flex-col gap-2 px-2 py-2" aria-busy="true">
			{Array.from({ length: 6 }, (_, index) => (
				<div key={index} className="flex items-center gap-2 rounded-lg px-2 py-1.5">
					<div className="h-4 w-4 animate-pulse rounded-md bg-foreground/10" />
					<div className="h-3 flex-1 animate-pulse rounded bg-foreground/5" />
					<div className="h-3 w-8 animate-pulse rounded bg-foreground/5" />
				</div>
			))}
		</div>
	);
}
