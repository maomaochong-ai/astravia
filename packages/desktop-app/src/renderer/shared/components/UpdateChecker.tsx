import { UpdateCheckerView } from "@astravia/theme-ui/overlays";
import { useUpdateCheckerModel } from "../hooks/useUpdateCheckerModel";

export function UpdateChecker(): JSX.Element {
	return <UpdateCheckerView {...useUpdateCheckerModel()} />;
}
