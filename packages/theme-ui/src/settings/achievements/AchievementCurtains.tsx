import type { CSSProperties, JSX } from "react";

export interface AchievementCurtainSideLayout {
	top: number;
	left?: number;
	right?: number;
}

export interface AchievementCurtainsLayout {
	height: number;
	aspectRatio: string;
	left: AchievementCurtainSideLayout;
	right: AchievementCurtainSideLayout;
}

export interface AchievementCurtainsAssets {
	left: string;
	right: string;
}

export interface AchievementCurtainsProps {
	layout: AchievementCurtainsLayout;
	assets: AchievementCurtainsAssets;
}

export function AchievementCurtains({ layout, assets }: AchievementCurtainsProps): JSX.Element {
	const leftStyle: CSSProperties = {
		...layout.left,
		height: layout.height,
		aspectRatio: layout.aspectRatio,
		backgroundImage: `url("${assets.left}")`,
		backgroundPosition: "center",
		backgroundSize: "contain",
	};
	const rightStyle: CSSProperties = {
		...layout.right,
		height: layout.height,
		aspectRatio: layout.aspectRatio,
		backgroundImage: `url("${assets.right}")`,
		backgroundPosition: "center",
		backgroundSize: "contain",
	};

	return (
		<div aria-hidden="true" className="pointer-events-none absolute inset-0 z-20 select-none">
			<span className="absolute bg-no-repeat" style={leftStyle} />
			<span className="absolute bg-no-repeat" style={rightStyle} />
		</div>
	);
}
