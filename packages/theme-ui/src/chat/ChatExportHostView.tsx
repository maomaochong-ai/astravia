import type { JSX, ReactNode } from "react";

export interface ChatExportHostViewProps {
	/** Off-screen message list (host ExportMessageList). */
	children: ReactNode;
}

/**
 * Off-screen export shell. Host mounts message list and runs capture effect.
 */
export function ChatExportHostView({ children }: ChatExportHostViewProps): JSX.Element {
	return (
		<div aria-hidden="true" className="fixed left-[-100000px] top-0 w-[768px] bg-background">
			{children}
		</div>
	);
}
