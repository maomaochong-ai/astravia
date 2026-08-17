import type { ReactNode } from "react";

export interface ManageActionApprovalFrameLabels {
	readonly reject: string;
	readonly confirm: string;
	readonly responding: string;
	readonly permission: string;
}

/** Shared frame props for manage approval shells (host Dialog/Drawer injects via Frame slot). */
export interface ManageActionApprovalFrameProps {
	readonly presentation: "dialog" | "drawer";
	readonly title: string;
	readonly summary: string;
	readonly icon: string;
	readonly badge?: string;
	readonly destructive?: boolean;
	readonly labels: ManageActionApprovalFrameLabels;
	readonly responding: boolean;
	readonly countdown: string;
	readonly canApprove?: boolean;
	readonly error?: string | null;
	readonly onReject: () => void;
	readonly onApprove: () => void;
	readonly children: ReactNode;
	readonly className?: string;
}
