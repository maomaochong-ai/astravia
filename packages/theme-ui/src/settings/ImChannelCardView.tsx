import type { JSX, ReactNode } from "react";
import { Button, cn } from "@astravia/ui";
import { ImStatusBadgeView, type ImStatusBadgeStatus } from "./ImStatusBadgeView";

export interface ImChannelCardViewLabels {
	readonly channelActive: string;
	readonly channelNotAssociated: string;
	readonly activateChannel: string;
	readonly activateChannelTitle: string;
	readonly statusLabel: string;
}

export interface ImChannelCardViewProps {
	readonly name: string;
	readonly subtitle: string;
	readonly iconClass: string;
	readonly configured: boolean;
	readonly isActive: boolean;
	readonly effectiveStatus: ImStatusBadgeStatus;
	readonly actionLabel: string;
	readonly onAction: () => void;
	readonly onActivate?: () => void;
	readonly labels: ImChannelCardViewLabels;
	/** Optional override for status badge (e.g. host-wired i18n). Defaults to ImStatusBadgeView. */
	readonly statusBadge?: ReactNode;
}

export function ImChannelCardView({
	name,
	subtitle,
	iconClass,
	configured,
	isActive,
	effectiveStatus,
	actionLabel,
	onAction,
	onActivate,
	labels,
	statusBadge,
}: ImChannelCardViewProps): JSX.Element {
	return (
		<div
			className={cn(
				"flex flex-col gap-4 rounded-2xl border bg-card p-5",
				isActive ? "border-primary/60" : "border-border",
			)}
		>
			<div className="flex items-start gap-3">
				<span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-background">
					<span className={cn(iconClass, "h-6 w-6")} />
				</span>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-1.5">
						<div className="text-[15px] font-semibold text-foreground">{name}</div>
						{isActive && (
							<span className="inline-flex items-center rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
								{labels.channelActive}
							</span>
						)}
					</div>
					<div className="mt-0.5 truncate text-[12px] text-muted-foreground">{subtitle}</div>
				</div>
				{configured ? (
					(statusBadge ?? (
						<ImStatusBadgeView label={labels.statusLabel} status={effectiveStatus} />
					))
				) : (
					<span className="inline-flex items-center rounded-full bg-muted-foreground/15 px-2 py-0.5 text-[11px] text-muted-foreground">
						{labels.channelNotAssociated}
					</span>
				)}
			</div>

			<div className="flex gap-2">
				{configured && onActivate && (
					<Button variant="outline" onClick={onActivate} title={labels.activateChannelTitle}>
						<span className="icon-[mdi--swap-horizontal] h-4 w-4" />
						{labels.activateChannel}
					</Button>
				)}
				<Button variant="outline" onClick={onAction} className="flex-1">
					<span className="icon-[mdi--cog-outline] h-4 w-4" />
					{actionLabel}
				</Button>
			</div>
		</div>
	);
}
