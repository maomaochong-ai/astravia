import { useThemeHost } from "../host";
import type { ThemePagesModel } from "./types";

export function useThemePagesModel(): ThemePagesModel {
	const host = useThemeHost();
	const useHostThemePagesModel = host.pages?.useThemePagesModel;
	if (!useHostThemePagesModel) {
		throw new Error("Theme host does not provide theme pages model capability.");
	}
	return useHostThemePagesModel();
}
