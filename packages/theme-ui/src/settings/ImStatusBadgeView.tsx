import type { JSX } from "react";

function cn(...parts: Array<string | false | null | undefined>): string {
	return parts.filter(Boolean).join(" ");
}

export type ImStatusBadgeStatus =
	| "offline"
	| "connecting"
	| "online"
	| "error"
	| "awaiting_bind";

const STATUS_CLASS: Record<ImStatusBadgeStatus, string> = {
	offline: "bg-muted text-muted-foreground",
	connecting: "bg-amber-500/15 text-amber-400",
	online: "bg-emerald-500/15 text-emerald-400",
	error: "bg-destructive/15 text-destructive",
	awaiting_bind: "bg-primary/10 text-primary",
};

export interface ImStatusBadgeViewProps {
	readonly label: string;
	readonly status: ImStatusBadgeStatus;
}

export function ImStatusBadgeView({ label, status }: ImStatusBadgeViewProps): JSX.Element {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium",
				STATUS_CLASS[status],
			)}
		>
			<span className="h-1.5 w-1.5 rounded-full bg-current" />
			{label}
		</span>
	);
}
