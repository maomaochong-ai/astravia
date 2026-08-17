import type { JSX, ReactNode } from "react";

export interface ProjectsPanelMenusViewProps {
	projectMenu: ReactNode;
	sessionMenu: ReactNode;
}

/** Host menus shell — session/project context menus injected as nodes. */
export function ProjectsPanelMenusView({
	projectMenu,
	sessionMenu,
}: ProjectsPanelMenusViewProps): JSX.Element {
	return (
		<>
			{sessionMenu}
			{projectMenu}
		</>
	);
}
