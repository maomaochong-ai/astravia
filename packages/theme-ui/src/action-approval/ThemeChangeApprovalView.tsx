import type { ComponentType, JSX, ReactNode } from "react";

export interface ThemeChangeApprovalViewProps {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	readonly Drawer: ComponentType<any>;
	readonly drawerProps: object;
	readonly hasInput: boolean;
	readonly picker: ReactNode;
	readonly rawInput: unknown;
}

export function ThemeChangeApprovalView({
	Drawer,
	drawerProps,
	hasInput,
	picker,
	rawInput,
}: ThemeChangeApprovalViewProps): JSX.Element {
	return (
		<Drawer {...drawerProps}>
			{hasInput ? (
				picker
			) : (
				<pre className="max-h-[200px] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border/50 bg-background/50 p-3 font-mono text-[11px] leading-5 text-foreground">
					{JSON.stringify(rawInput, null, 2)}
				</pre>
			)}
		</Drawer>
	);
}
