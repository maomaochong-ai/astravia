import * as themeSdk from "@astravia/theme-sdk";
import * as themeSdkPages from "@astravia/theme-sdk/pages";
import * as themeSdkRouting from "@astravia/theme-sdk/routing";
import * as themeSdkStorage from "@astravia/theme-sdk/storage";
import * as themeSdkUsage from "@astravia/theme-sdk/usage";
import * as themeUi from "@astravia/theme-ui";
import * as themeUiAppShell from "@astravia/theme-ui/app-shell";
import * as themeUiSidebar from "@astravia/theme-ui/sidebar";
import * as astraviaUi from "@astravia/ui";
import type { ModuleFederation } from "@module-federation/enhanced/runtime";
import * as MotionReact from "motion/react";
import * as React from "react";
import * as jsxDevRuntime from "react/jsx-dev-runtime";
import * as jsxRuntime from "react/jsx-runtime";
import * as ReactDom from "react-dom";
import * as desktopThemeAppShell from "../sdk/app-shell";
import * as desktopThemeSidebar from "../sdk/sidebar-primitives";

type ModuleFederationShared = Parameters<typeof ModuleFederation.prototype.initOptions>[0]["shared"];

const sharedModules = {
	"@astravia/desktop-theme-ui/app-shell": { module: desktopThemeAppShell, version: "0.1.0" },
	"@astravia/desktop-theme-ui/sidebar": { module: desktopThemeSidebar, version: "0.1.0" },
	"@astravia/theme-sdk": { module: themeSdk, version: "0.1.0" },
	"@astravia/theme-sdk/pages": { module: themeSdkPages, version: "0.1.0" },
	"@astravia/theme-sdk/routing": { module: themeSdkRouting, version: "0.1.0" },
	"@astravia/theme-sdk/storage": { module: themeSdkStorage, version: "0.1.0" },
	"@astravia/theme-sdk/usage": { module: themeSdkUsage, version: "0.1.0" },
	"@astravia/theme-ui": { module: themeUi, version: "0.1.0" },
	"@astravia/theme-ui/app-shell": { module: themeUiAppShell, version: "0.1.0" },
	"@astravia/theme-ui/sidebar": { module: themeUiSidebar, version: "0.1.0" },
	"@astravia/ui": { module: astraviaUi, version: "0.1.0" },
	"motion/react": { module: MotionReact, version: "12.23.12" },
	react: { module: React, version: React.version },
	"react-dom": { module: ReactDom, version: ReactDom.version },
	"react/jsx-runtime": { module: jsxRuntime, version: React.version },
	"react/jsx-dev-runtime": { module: jsxDevRuntime, version: React.version },
};

export function createThemeRuntimeShared(): NonNullable<ModuleFederationShared> {
	return Object.fromEntries(
		Object.entries(sharedModules).map(([name, shared]) => [
			name,
			{
				version: shared.version,
				lib: () => shared.module,
				shareConfig: { singleton: true, requiredVersion: false },
			},
		]),
	) as NonNullable<ModuleFederationShared>;
}
