import type { JSX } from "react";

export function ProjectSessionsLoadingView(): JSX.Element {
	return (
		<div className="space-y-1 py-1 pl-8 pr-2" aria-busy="true">
			{Array.from({ length: 3 }, (_, index) => (
				<div key={index} className="flex items-center gap-2 px-1 py-1.5">
					<div className="h-3 flex-1 animate-pulse rounded bg-foreground/5" />
					<div className="h-2.5 w-9 animate-pulse rounded bg-foreground/5" />
				</div>
			))}
		</div>
	);
}
