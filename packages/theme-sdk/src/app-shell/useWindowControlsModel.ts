import { useThemeHost } from "../host";
import type { WindowControlsModel } from "./types";

export function useWindowControlsModel(): WindowControlsModel {
	const host = useThemeHost();
	const useHostWindowControlsModel = host.appShell?.useWindowControlsModel;
	if (!useHostWindowControlsModel) {
		throw new Error("Theme host does not provide window controls model capability.");
	}
	return useHostWindowControlsModel();
}
