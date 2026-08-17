import type { JSX } from "react";

export function RouteContentLoadingView(): JSX.Element {
	return (
		<div className="flex h-full min-h-0 w-full flex-1 overflow-hidden px-8 pb-8 pt-5" aria-busy="true">
			<div className="mx-auto flex w-full max-w-5xl flex-col">
				<div className="h-7 w-40 animate-pulse rounded-lg bg-foreground/10" />
				<div className="mt-2 h-3 w-64 max-w-full animate-pulse rounded bg-foreground/5" />
				<div className="mt-8 grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
					{Array.from({ length: 6 }, (_, index) => (
						<div
							key={index}
							className="h-32 animate-pulse rounded-xl border border-border/40 bg-card/30"
						/>
					))}
				</div>
			</div>
		</div>
	);
}
