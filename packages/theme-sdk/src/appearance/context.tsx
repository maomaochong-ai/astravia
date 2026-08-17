import { createContext, type JSX, type ReactNode, useContext, useMemo } from "react";
import {
	DEFAULT_THEME_APPEARANCE,
	type ThemeAppearance,
	type ThemeSurfaceConfig,
	type ThemeSurfaceSlot,
} from "./types";

const ThemeAppearanceContext = createContext<ThemeAppearance>(DEFAULT_THEME_APPEARANCE);

export function ThemeAppearanceProvider({
	appearance,
	children,
}: {
	appearance?: ThemeAppearance;
	children: ReactNode;
}): JSX.Element {
	const value = useMemo(() => appearance ?? DEFAULT_THEME_APPEARANCE, [appearance]);

	return (
		<ThemeAppearanceContext.Provider value={value}>
			{children}
		</ThemeAppearanceContext.Provider>
	);
}

export function useThemeAppearance(): ThemeAppearance {
	return useContext(ThemeAppearanceContext);
}

export function useThemeSurface(slot: ThemeSurfaceSlot): ThemeSurfaceConfig | undefined {
	const appearance = useThemeAppearance();
	return appearance.surfaces?.[slot];
}
