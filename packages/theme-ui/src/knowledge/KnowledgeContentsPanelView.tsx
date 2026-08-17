import { motion } from "motion/react";
import type { JSX, ReactNode } from "react";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

export interface KnowledgeContentsPanelViewProps {
	readonly breadcrumb?: ReactNode;
	readonly content: ReactNode;
	readonly contextMenu?: ReactNode;
	readonly empty?: boolean;
	readonly emptyActions?: ReactNode;
	readonly emptyDescription?: string;
	readonly emptyTitle?: string;
	readonly onBackgroundClick?: (event: { target: EventTarget | null }) => void;
	readonly renameDialog?: ReactNode;
	readonly skeleton?: ReactNode;
}

export function KnowledgeContentsPanelView({
	breadcrumb,
	content,
	contextMenu,
	empty,
	emptyActions,
	emptyDescription,
	emptyTitle,
	onBackgroundClick,
	renameDialog,
	skeleton,
}: KnowledgeContentsPanelViewProps): JSX.Element {
	return (
		<div className="flex min-h-0 flex-1 gap-4 px-8 pb-8">
			<motion.div
				initial={{ opacity: 0, scale: 0.995 }}
				animate={{ opacity: 1, scale: 1 }}
				transition={{ duration: 0.32, delay: 0.04, ease: EASE_OUT }}
				className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
			>
				{breadcrumb}

				{empty ? (
					// biome-ignore lint/a11y/useKeyWithClickEvents: background click clears selection; keyboard uses Esc
					<div className="min-h-0 flex-1 overflow-y-auto py-3" onClick={onBackgroundClick}>
						<motion.div
							initial={{ opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.45, ease: EASE_OUT }}
							className="flex h-full min-h-[260px] items-center justify-center"
						>
							<div className="flex max-w-sm flex-col items-center px-8 text-center">
								<div className="relative mb-5 flex h-20 w-20 items-center justify-center">
									<span className="absolute inset-0 rounded-[1.75rem] bg-primary/10" />
									<span className="absolute inset-2 rounded-3xl bg-background/60 ring-1 ring-inset ring-primary/15" />
									<span className="icon-[mdi--folder-open-outline] relative h-9 w-9 text-primary/70" />
								</div>
								{emptyTitle && (
									<h2 className="text-[15px] font-semibold text-foreground">{emptyTitle}</h2>
								)}
								{emptyDescription && (
									<p className="mt-1.5 text-[12px] leading-5 text-muted-foreground/60">{emptyDescription}</p>
								)}
								{emptyActions && <div className="mt-5">{emptyActions}</div>}
							</div>
						</motion.div>
					</div>
				) : skeleton ? (
					<div className="-mx-8 flex min-h-0 flex-1">{skeleton}</div>
				) : (
					content
				)}
			</motion.div>

			{contextMenu}
			{renameDialog}
		</div>
	);
}
