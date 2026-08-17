import { useThemeHost } from "../host";
import type { ThemeRouteModel } from "./types";

export function useThemeRouteModel(): ThemeRouteModel {
	const host = useThemeHost();
	const useHostThemeRouteModel = host.routing?.useThemeRouteModel;
	if (!useHostThemeRouteModel) {
		throw new Error("Theme host does not provide useThemeRouteModel.");
	}
	return useHostThemeRouteModel();
}
