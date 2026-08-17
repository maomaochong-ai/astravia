import type { JSX } from "react";
import { SettingsMenuActionButton } from "./SettingsMenuActionButton";

export interface SettingsMenuSettingsItemProps {
	label: string;
	onOpenSettings: () => void;
}

export function SettingsMenuSettingsItem({
	label,
	onOpenSettings,
}: SettingsMenuSettingsItemProps): JSX.Element {
	return (
		<SettingsMenuActionButton icon="icon-[solar--settings-linear]" onClick={onOpenSettings}>
			{label}
		</SettingsMenuActionButton>
	);
}
