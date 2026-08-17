import type { ComponentType, JSX } from "react";

export interface SchedulerUpdateApprovalViewProps {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	readonly EditView: ComponentType<any>;
	readonly drawerProps: object;
}

export function SchedulerUpdateApprovalView({
	EditView,
	drawerProps,
}: SchedulerUpdateApprovalViewProps): JSX.Element {
	return <EditView {...drawerProps} />;
}
