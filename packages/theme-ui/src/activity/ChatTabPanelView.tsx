import type { JSX, ReactNode } from "react";

export interface ChatTabPanelViewProps {
	readonly loading: boolean;
	readonly loadingLabel: string;
	readonly notFlowing: boolean;
	readonly notFlowingLabel: string;
	readonly panel: ReactNode;
}

export function ChatTabPanelView({
	loading,
	loadingLabel,
	notFlowing,
	notFlowingLabel,
	panel,
}: ChatTabPanelViewProps): JSX.Element {
	if (loading) {
		return (
			<div className="flex h-full items-center justify-center text-[12px] text-muted-foreground/50">
				{loadingLabel}
			</div>
		);
	}

	if (notFlowing) {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground/50">
				<span className="icon-[mdi--message-text-outline] text-[28px]" />
				<span className="text-[12px]">{notFlowingLabel}</span>
			</div>
		);
	}

	return <>{panel}</>;
}
