import { RouterProvider } from "@tanstack/react-router";
import { ThemeHostProvider } from "@astravia/theme-sdk";
import { StrictMode } from "react";
import type { Root } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { router } from "./router";
import { i18n, initI18n } from "./shared/i18n";
import { desktopThemeHost } from "./shared/theme/desktopThemeHost";
import { ThemeRuntimeProvider } from "./shared/theme/runtime";
import { ThemeColorOverrideBridge } from "./shared/theme/ThemeColorOverrideBridge";

export function renderApp(root: Root): void {
	initI18n();

	root.render(
		<StrictMode>
			<I18nextProvider i18n={i18n}>
				<ThemeHostProvider host={desktopThemeHost}>
					<ThemeRuntimeProvider>
						<ThemeColorOverrideBridge />
						<RouterProvider router={router} />
					</ThemeRuntimeProvider>
				</ThemeHostProvider>
			</I18nextProvider>
		</StrictMode>,
	);
}
