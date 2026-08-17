import { useThemeHost } from "../host";
import type { SidebarModel, SidebarModelInput } from "./types";

export function useSidebarModel(input: SidebarModelInput): SidebarModel {
	const host = useThemeHost();
	const useHostSidebarModel = host.sidebar?.useSidebarModel;
	if (!useHostSidebarModel) {
		throw new Error("Theme host does not provide sidebar model capability.");
	}
	return useHostSidebarModel(input);
}
