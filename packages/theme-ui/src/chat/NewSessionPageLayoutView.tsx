import type { JSX, ReactNode } from "react";

export interface NewSessionPageLayoutViewProps {
	readonly background: ReactNode;
	readonly dropZone: (children: ReactNode) => ReactNode;
	readonly guidingWords?: ReactNode;
	readonly hero?: ReactNode;
	readonly inputBar: ReactNode;
	readonly isShort: boolean;
	readonly skillBadges?: ReactNode;
	readonly themedBackground?: ReactNode;
}

/**
 * 新会话页主列布局：整块内容垂直居中（hero + 技能 + 输入 + 引导词作为一体）。
 * 防抖依赖 host 侧预留槽位与资源一次落盘，而不是把输入栏单独钉在视口中线
 * （后者会让上方 hero 把视觉重心整体顶上去）。
 */
export function NewSessionPageLayoutView({
	background,
	dropZone,
	guidingWords,
	hero,
	inputBar,
	isShort,
	skillBadges,
	themedBackground,
}: NewSessionPageLayoutViewProps): JSX.Element {
	return (
		<>
			{dropZone(
				<>
					{background}
					{themedBackground}
					<div className="no-drag relative z-[1] flex flex-1 flex-col overflow-y-auto">
						<div className="flex min-h-full w-full flex-col items-center justify-center px-6 py-6">
							{hero}
							{skillBadges && (
								<div className="mx-auto w-full max-w-2xl px-2 sm:px-4">{skillBadges}</div>
							)}
							<div className="w-full">{inputBar}</div>
							{!isShort && guidingWords && (
								<div className="mx-auto w-full max-w-2xl px-2 sm:px-4">{guidingWords}</div>
							)}
						</div>
					</div>
				</>,
			)}
		</>
	);
}
