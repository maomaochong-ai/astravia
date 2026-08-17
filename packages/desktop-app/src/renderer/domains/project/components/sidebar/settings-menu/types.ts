import type { ThemeMode } from "@shared/store/atoms";

export interface SettingsMenuThemeOption {
	icon: string;
	label: string;
	value: ThemeMode;
}

export interface SettingsMenuModel {
	mode: ThemeMode;
	/** Claw（IM）是否在线，控制触发器内 Claw 状态徽章展示。 */
	clawOnline: boolean;
	/** Claw 徽章 tooltip 文案。 */
	clawTitle: string;
	open: boolean;
	themeOptions: SettingsMenuThemeOption[];
	actions: {
		openSettings(): void;
		setMode(mode: ThemeMode, event: React.MouseEvent<HTMLButtonElement>): void;
		setOpen(open: boolean): void;
	};
}
