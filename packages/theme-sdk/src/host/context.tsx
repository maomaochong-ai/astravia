import { createContext, type JSX, useContext } from "react";
import type { ThemeHost, ThemeHostProviderProps } from "./types";

const ThemeHostContext = createContext<ThemeHost | null>(null);

export function ThemeHostProvider({ children, host }: ThemeHostProviderProps): JSX.Element {
	return (
		<ThemeHostContext.Provider value={host}>
			{children}
		</ThemeHostContext.Provider>
	);
}

export function useThemeHost(): ThemeHost {
	const host = useContext(ThemeHostContext);
	if (!host) {
		throw new Error("ThemeHostProvider is required before using theme SDK model hooks.");
	}
	return host;
}
