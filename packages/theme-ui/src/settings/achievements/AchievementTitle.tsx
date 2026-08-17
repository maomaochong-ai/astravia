import type { CSSProperties, JSX } from "react";

export interface AchievementTitleLayout {
	top: number;
	left: number;
	width: number;
	aspectRatio: string;
}

export interface AchievementTitleProps {
	title: string;
	layout: AchievementTitleLayout;
	titleImageUrl: string;
	titleTextOffsetY: number;
	titleColor?: string;
}

export function AchievementTitle({
	title,
	layout,
	titleImageUrl,
	titleTextOffsetY,
	titleColor = "#f4d58a",
}: AchievementTitleProps): JSX.Element {
	const layoutStyle: CSSProperties = {
		top: layout.top,
		left: layout.left,
		width: layout.width,
		aspectRatio: layout.aspectRatio,
	};

	return (
		<div className="relative z-30 mx-auto flex max-w-full items-center justify-center" style={layoutStyle}>
			<img
				aria-hidden="true"
				alt=""
				draggable={false}
				src={titleImageUrl}
				className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain"
			/>
			<h1
				className="relative px-20 pb-1 text-center text-[20px] font-bold"
				style={{
					color: titleColor,
					transform: `translateY(${titleTextOffsetY}px)`,
				}}
			>
				{title}
			</h1>
		</div>
	);
}
