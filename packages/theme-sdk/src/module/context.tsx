import { ThemeAppearanceProvider } from "../appearance";
import { createContext, type JSX, type ReactNode, useContext, useMemo } from "react";
import { DEFAULT_THEME_MODULE, type ThemeModule } from "./types";

const ThemeModuleContext = createContext<ThemeModule>(DEFAULT_THEME_MODULE);

export function ThemeProvider({
	children,
	theme,
}: {
	children: ReactNode;
	theme?: ThemeModule;
}): JSX.Element {
	const value = useMemo(() => theme ?? DEFAULT_THEME_MODULE, [theme]);

	return (
		<ThemeModuleContext.Provider value={value}>
			<ThemeAppearanceProvider appearance={value.appearance}>
				{children}
			</ThemeAppearanceProvider>
		</ThemeModuleContext.Provider>
	);
}

export function useThemeModule(): ThemeModule {
	return useContext(ThemeModuleContext);
}
