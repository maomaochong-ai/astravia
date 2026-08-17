import type { JSX, ReactNode } from "react";

/**
 * Slot shell for batch project prompt field.
 * Host injects SkillPromptArea (domain-coupled) as children.
 */
export interface BatchProjectPromptFieldViewProps {
	children: ReactNode;
}

export function BatchProjectPromptFieldView({ children }: BatchProjectPromptFieldViewProps): JSX.Element {
	return <>{children}</>;
}
