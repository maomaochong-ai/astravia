export const artifactLibraryAssets = {
	artifacts: {
		bell: new URL("./assets/artifact-bell.webp", import.meta.url).href,
		brush: new URL("./assets/artifact-brush.webp", import.meta.url).href,
		disc: new URL("./assets/artifact-disc.webp", import.meta.url).href,
		jadeTablet: new URL("./assets/artifact-jade-tablet.webp", import.meta.url).href,
		mirror: new URL("./assets/artifact-mirror.webp", import.meta.url).href,
		seal: new URL("./assets/artifact-seal.webp", import.meta.url).href,
		talisman: new URL("./assets/artifact-talisman.webp", import.meta.url).href,
	},
	character: new URL("./assets/artifact-character.webp", import.meta.url).href,
	panel: new URL("./assets/artifact-panel.webp", import.meta.url).href,
	pill: new URL("./assets/artifact-pill.webp", import.meta.url).href,
} as const;
