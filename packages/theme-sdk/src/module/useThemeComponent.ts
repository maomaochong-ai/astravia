import { useThemeModule } from "./context";
import type { ThemeComponentId, ThemeComponentRegistry } from "./types";

export function useThemeComponent<TKey extends ThemeComponentId>(
	id: TKey,
	fallback: NonNullable<ThemeComponentRegistry[TKey]>,
): NonNullable<ThemeComponentRegistry[TKey]> {
	const theme = useThemeModule();
	return (theme.components?.[id] ?? fallback) as NonNullable<ThemeComponentRegistry[TKey]>;
}
