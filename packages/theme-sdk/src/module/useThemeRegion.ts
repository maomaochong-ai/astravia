import { useThemeModule } from "./context";
import type { ThemeRegionId, ThemeRegionRegistry } from "./types";

export function useThemeRegion<TKey extends ThemeRegionId>(id: TKey): ThemeRegionRegistry[TKey] | undefined {
	const theme = useThemeModule();
	return theme.regions?.[id] as ThemeRegionRegistry[TKey] | undefined;
}
