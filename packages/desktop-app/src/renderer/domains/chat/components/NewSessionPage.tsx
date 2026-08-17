import { useThemeSurface } from "@astravia/theme-sdk/appearance";
import { NewSessionPageView } from "./new-session/NewSessionPageView";
import { useNewSessionPageModel } from "./new-session/useNewSessionPageModel";

export function NewSessionPage(): JSX.Element {
	const surface = useThemeSurface("chat.newSessionPage");
	const model = useNewSessionPageModel();

	return <NewSessionPageView {...model} className={surface?.rootClassName} />;
}
