import type { SidebarNavItemButton, SidebarNavigationProps } from "@astravia/theme-ui/sidebar";
import type { ComponentType } from "react";

export type {
	NavIndicatorBounds,
	SidebarNavItem,
} from "@astravia/theme-sdk/sidebar";
export type { SidebarNavItemButtonProps, SidebarNavigationProps } from "@astravia/theme-ui/sidebar";
export { SidebarNavItemButton, SidebarNavigation } from "@astravia/theme-ui/sidebar";

declare module "@astravia/theme-sdk" {
	interface ThemeComponentRegistry {
		readonly "sidebar.navItem"?: typeof SidebarNavItemButton;
		readonly "sidebar.navigation"?: ComponentType<SidebarNavigationProps>;
	}
}
