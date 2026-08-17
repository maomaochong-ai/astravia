import { UpdateChecker } from "@shared/components/UpdateChecker";
import { GeneralSettingsView as ThemeGeneralSettingsView } from "@astravia/theme-ui/settings";
import { SETTINGS_SECTION } from "../registry";
import type { GeneralSettingsModel } from "./useGeneralSettingsModel";

export interface GeneralSettingsViewProps {
	model: GeneralSettingsModel;
}

/** Thin host adapter: model + UpdateChecker only (no components/ui host chrome). */
export function GeneralSettingsView({ model }: GeneralSettingsViewProps): JSX.Element {
	return (
		<ThemeGeneralSettingsView
			labels={model.labels}
			sections={{
				basics: SETTINGS_SECTION["general-basics"],
				app: SETTINGS_SECTION["general-app"],
				developer: SETTINGS_SECTION["general-developer"],
			}}
			workspacePath={model.workspacePath}
			onSelectWorkspace={() => void model.actions.selectWorkspace()}
			onResetWorkspace={() => void model.actions.resetWorkspace()}
			updatesSlot={<UpdateChecker />}
			executionMode={model.executionMode}
			onExecutionModeChange={(mode) => void model.actions.changeExecutionMode(mode)}
			sandboxUnavailableReason={model.sandboxUnavailableReason}
			notificationsEnabled={model.notificationsEnabled}
			onNotificationsChange={model.actions.toggleNotifications}
			debugMode={model.debugMode}
			onDebugChange={model.actions.toggleDebug}
			exportingDiagnostics={model.exportingDiagnostics}
			onExportDiagnostics={() => void model.actions.exportDiagnostics()}
			onStartAppGuide={model.actions.startAppGuide}
		/>
	);
}
