import { useThemeComponent } from "@astravia/theme-sdk";
import { useModelSelectorModel } from "../hooks/useModelSelectorModel";
import { ModelSelectorView } from "./model-selector/ModelSelectorView";

export function ModelSelector(): JSX.Element {
	const model = useModelSelectorModel();
	const ThemedModelSelectorView = useThemeComponent("chat.modelSelectorView", ModelSelectorView);
	if (model.empty) return <></>;
	return <ThemedModelSelectorView {...model.viewProps} />;
}
