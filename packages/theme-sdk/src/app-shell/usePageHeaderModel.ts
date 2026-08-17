import { useThemeHost } from "../host";
import type { PageHeaderModel, PageHeaderModelInput } from "./types";

export function usePageHeaderModel(input: PageHeaderModelInput): PageHeaderModel {
	const host = useThemeHost();
	const useHostPageHeaderModel = host.appShell?.usePageHeaderModel;
	if (!useHostPageHeaderModel) {
		throw new Error("Theme host does not provide page header model capability.");
	}
	return useHostPageHeaderModel(input);
}
