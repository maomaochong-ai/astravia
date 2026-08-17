import type { SystemInfo, SystemPlatform } from "./types";

const normalizedPlatform = typeof navigator === "undefined" ? "" : navigator.platform.toUpperCase();
const platform: SystemPlatform = normalizedPlatform.includes("MAC")
	? "darwin"
	: normalizedPlatform.includes("WIN")
		? "win32"
		: normalizedPlatform.includes("LINUX")
			? "linux"
			: "unknown";

const systemInfo: SystemInfo = {
	isLinux: platform === "linux",
	isMac: platform === "darwin",
	isWindows: platform === "win32",
	platform,
};

export function useSystemInfo(): SystemInfo {
	return systemInfo;
}
