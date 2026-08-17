import { useSystemInfo } from "@astravia/theme-sdk";
import { AppBackground, type AppBackgroundProps } from "@astravia/theme-ui";
import { cn } from "@astravia/ui";
import type { JSX } from "react";

export function XianxiaAppBackground({
	className,
	...props
}: AppBackgroundProps): JSX.Element {
	const systemInfo = useSystemInfo();

	return (
		<AppBackground
			className={cn(className, systemInfo.isMac && "xianxia-app-background-edge-to-edge")}
			{...props}
		/>
	);
}
