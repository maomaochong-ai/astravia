import type { JSX, Ref } from "react";

export interface SandboxGrantViewItem {
	id: string;
	capabilityLabel: string;
	toolName: string;
	grantRoot: string;
	relativeTime: string;
	absoluteTime: string;
}

export interface SandboxGrantsBadgeViewLabels {
	tooltip: string;
	title: string;
	revokeAll: string;
	revoke: string;
}

export interface SandboxGrantsBadgeViewProps {
	count: number;
	open: boolean;
	grants: readonly SandboxGrantViewItem[];
	labels: SandboxGrantsBadgeViewLabels;
	containerRef: Ref<HTMLDivElement>;
	onToggle: () => void;
	onRevokeAll: () => void;
	onRevoke: (grantId: string) => void;
}

/**
 * Sandbox grants badge + dropdown panel. Host pre-resolves labels and relative times.
 */
export function SandboxGrantsBadgeView({
	count,
	open,
	grants,
	labels,
	containerRef,
	onToggle,
	onRevokeAll,
	onRevoke,
}: SandboxGrantsBadgeViewProps): JSX.Element {
	return (
		<div ref={containerRef} className="relative">
			<button
				type="button"
				onClick={onToggle}
				title={labels.tooltip}
				className={`flex h-7 items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 text-[11px] font-medium text-amber-600 transition-colors hover:bg-amber-500/20 dark:text-amber-400 ${
					open ? "ring-1 ring-amber-500/40" : ""
				}`}
			>
				<span className="icon-[solar--shield-keyhole-minimalistic-linear] h-3.5 w-3.5" />
				<span>{count}</span>
			</button>
			{open ? (
				<div className="absolute right-0 top-9 z-50 w-[360px] rounded-lg border border-border bg-popover p-2 shadow-lg">
					<div className="flex items-center justify-between px-1 pb-1.5">
						<div className="text-[12px] font-medium text-foreground">{labels.title}</div>
						<button
							type="button"
							onClick={onRevokeAll}
							className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
						>
							{labels.revokeAll}
						</button>
					</div>
					<div className="max-h-[320px] space-y-1 overflow-auto">
						{grants.map((grant) => (
							<div
								key={grant.id}
								className="flex items-start gap-2 rounded-md px-2 py-1.5 text-[11px] hover:bg-muted/50"
							>
								<div className="min-w-0 flex-1">
									<div className="flex items-center gap-1.5">
										<span className="rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
											{grant.toolName}·{grant.capabilityLabel}
										</span>
										<span title={grant.absoluteTime} className="text-[10px] text-muted-foreground/70">
											{grant.relativeTime}
										</span>
									</div>
									<div className="mt-0.5 truncate font-mono text-[11px] text-foreground" title={grant.grantRoot}>
										{grant.grantRoot}
									</div>
								</div>
								<button
									type="button"
									onClick={() => onRevoke(grant.id)}
									className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
								>
									{labels.revoke}
								</button>
							</div>
						))}
					</div>
				</div>
			) : null}
		</div>
	);
}
