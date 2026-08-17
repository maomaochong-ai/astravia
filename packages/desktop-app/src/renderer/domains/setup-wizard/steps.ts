import { isMac } from "@shared/lib/platform";

export type SetupWizardStepId = "permissions" | "languageAppearance" | "models" | "welcome";

/** macOS: language/appearance → permissions → models → welcome; other platforms skip permissions. */
export function getSetupWizardSteps(): readonly SetupWizardStepId[] {
	return isMac
		? ["languageAppearance", "permissions", "models", "welcome"]
		: ["languageAppearance", "models", "welcome"];
}
