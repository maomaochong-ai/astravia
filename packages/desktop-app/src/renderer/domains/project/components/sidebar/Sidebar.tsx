import { useThemeRegion } from "@astravia/theme-sdk";
import { useSidebarModel } from "@astravia/theme-sdk/sidebar";
import { DefaultSidebar } from "./DefaultSidebar";
import type { SidebarProps } from "./types";

export function Sidebar(props: SidebarProps): JSX.Element {
	const model = useSidebarModel(props);
	const ThemeSidebar = useThemeRegion("sidebar");
	if (ThemeSidebar) {
		return (
			<ThemeSidebar
				classNames={props.classNames}
				model={model}
				onOpenSession={props.onOpenSession}
			/>
		);
	}
	return (
		<DefaultSidebar
			classNames={props.classNames}
			model={model}
			onOpenSession={props.onOpenSession}
		/>
	);
}
