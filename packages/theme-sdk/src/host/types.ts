import type { ReactNode } from "react";
import type { AppShellThemeHost } from "../app-shell";
import type { ThemePagesThemeHost } from "../pages";
import type { RoutingThemeHost } from "../routing";
import type { SidebarThemeHost } from "../sidebar";
import type { ThemeStorageThemeHost } from "../storage";
import type { ThemeUsageThemeHost } from "../usage";

export interface ThemeHost {
	readonly appShell?: AppShellThemeHost;
	readonly pages?: ThemePagesThemeHost;
	readonly routing?: RoutingThemeHost;
	readonly sidebar?: SidebarThemeHost;
	readonly storage?: ThemeStorageThemeHost;
	readonly usage?: ThemeUsageThemeHost;
}

export interface ThemeHostProviderProps {
	readonly children: ReactNode;
	readonly host: ThemeHost;
}
