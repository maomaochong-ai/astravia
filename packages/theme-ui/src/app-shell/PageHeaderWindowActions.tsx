import type { JSX, ReactNode } from "react";
import { PageHeaderActionGroup } from "./PageHeaderActionGroup";

export interface PageHeaderWindowActionsProps {
	children?: ReactNode;
	className?: string;
	/** Injected by host (e.g. connected WindowControls). Themes may omit or replace. */
	trailing?: ReactNode;
}

export function PageHeaderWindowActions({
	children,
	className,
	trailing,
}: PageHeaderWindowActionsProps): JSX.Element {
	return (
		<PageHeaderActionGroup className={className}>
			{children}
			{trailing}
		</PageHeaderActionGroup>
	);
}
