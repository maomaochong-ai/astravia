import { useThemeComponent } from "@astravia/theme-sdk";
import { useWindowControlsModel } from "@astravia/theme-sdk/app-shell";
import { DefaultWindowControls } from "@astravia/theme-ui/app-shell";
import type { WindowControlsProps } from "./types";

export { DefaultWindowControls } from "@astravia/theme-ui/app-shell";

export function WindowControls(props: WindowControlsProps): JSX.Element {
	const model = useWindowControlsModel();
	const ThemeWindowControls = useThemeComponent("app.windowControls", DefaultWindowControls);
	return <ThemeWindowControls {...props} model={model} />;
}
