import { useEffect, useState } from "react";

export type HostMode = "light" | "dark";

function readMode(): HostMode {
	// 宿主主题写在 <html data-mode="dark|light">（见 desktop-app shared/theme/apply.ts）。
	return document.documentElement.getAttribute("data-mode") === "light" ? "light" : "dark";
}

/** Track the host theme mode, re-rendering when the user switches light/dark. */
export function useHostMode(): HostMode {
	const [mode, setMode] = useState<HostMode>(readMode);
	useEffect(() => {
		const observer = new MutationObserver(() => setMode(readMode()));
		observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-mode"] });
		return () => observer.disconnect();
	}, []);
	return mode;
}

/** Read a host CSS custom property (resolved color string) off the document root. */
export function readCssVar(name: string): string {
	return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
