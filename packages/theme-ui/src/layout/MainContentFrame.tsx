import type { ComponentPropsWithoutRef, JSX, ReactNode } from "react";
import { useThemeComponent } from "@astravia/theme-sdk";
import { cn } from "@astravia/ui";

export interface MainContentFrameProps extends ComponentPropsWithoutRef<"main"> {
	children: ReactNode;
	contentClassName?: string;
	header: ReactNode;
}

export function MainContentFrame({
	children,
	className,
	contentClassName,
	header,
	...props
}: MainContentFrameProps): JSX.Element {
	const ThemedMainContentBackground = useThemeComponent(
		"app.mainContentBackground",
		EmptyMainContentBackground,
	);

	return (
		<main
			className={cn(
				"relative flex min-h-0 min-w-[320px] flex-1 flex-col overflow-visible bg-transparent",
				className,
			)}
			{...props}
		>
			<ThemedMainContentBackground />
			<div className="relative z-[1] shrink-0">
				{header}
			</div>
			<div className={cn("relative z-[1] flex min-h-0 flex-1 overflow-visible", contentClassName)}>
				{children}
			</div>
		</main>
	);
}

function EmptyMainContentBackground(): null {
	return null;
}
