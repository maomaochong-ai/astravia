export type SystemPlatform = "darwin" | "linux" | "unknown" | "win32";

export interface SystemInfo {
	readonly isLinux: boolean;
	readonly isMac: boolean;
	readonly isWindows: boolean;
	readonly platform: SystemPlatform;
}
