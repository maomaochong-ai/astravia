import { motion } from "motion/react";
import type { JSX } from "react";
import type { NewSessionGuidingWordsProps } from "./NewSession";

const easeOut = [0.16, 1, 0.3, 1] as const;
const guidingEase = [0.22, 1, 0.36, 1] as const;

// 与桌面端 GUIDING_WORD_PAGE=3 对齐：固定 3 槽位高度，轮播切换时不改组件高度。
// 单槽 = 1 行 text-[12px]/leading-relaxed + py-1.5（12*1.625 + 12 ≈ 31.5px）。
const WORD_SLOT_CLASS = "h-8";
const WORD_LIST_MIN_H_CLASS = "min-h-24";

/** 整块引导词区（含 mt-5 + 组标题 + 3 词槽）的外层预留高度，供 host 加载占位使用。 */
export const NEW_SESSION_GUIDING_WORDS_SLOT_MIN_H_CLASS = "min-h-[9.5rem]";

export function DefaultGuidingWords({
	className,
	groups,
	mounted,
	onPick,
	...props
}: NewSessionGuidingWordsProps): JSX.Element {
	const columnsClass = groups.length <= 1 ? "grid-cols-1" : "grid-cols-2";

	return (
		<div className={["mt-5 w-full", className].filter(Boolean).join(" ")} {...props}>
			<motion.div
				initial={{ opacity: 0, y: 8 }}
				animate={{ opacity: mounted ? 1 : 0, y: mounted ? 0 : 8 }}
				transition={{ duration: 0.5, delay: 0.35, ease: easeOut }}
				className={`grid w-full ${columnsClass} items-start gap-x-4`}
			>
				{groups.map((group) => (
					<div key={group.id} className="flex w-full min-w-0 flex-col gap-1.5">
						<div className="truncate px-0.5 text-[12px] font-semibold text-foreground/80" title={group.name}>
							{group.name}
						</div>
						<motion.div
							key={group.pageKey}
							initial="initial"
							animate="animate"
							variants={{ animate: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } } }}
							className={`flex min-w-0 flex-col ${WORD_LIST_MIN_H_CLASS}`}
						>
							{group.words.map((word, index) => {
								const isLast = index === group.words.length - 1;
								return (
									<motion.button
										key={`${group.pageKey}-${index}-${word}`}
										type="button"
										onClick={() => onPick(word)}
										variants={{
											initial: { opacity: 0, x: -6 },
											animate: { opacity: 1, x: 0 },
										}}
										transition={{ duration: 0.55, ease: guidingEase }}
										whileTap={{ scale: 0.98 }}
										title={word}
										className={`relative flex ${WORD_SLOT_CLASS} w-full min-w-0 shrink-0 items-center overflow-hidden py-1.5 pl-3 text-left text-[12px] leading-relaxed text-muted-foreground transition-colors hover:text-primary before:absolute before:left-0 before:border-l before:border-muted-foreground/30 before:content-[''] ${
											isLast
												? "before:top-0 before:h-4 before:w-2.5 before:rounded-bl-[7px] before:border-b"
												: "before:inset-y-0 before:w-0 after:absolute after:left-0 after:top-1/2 after:w-2.5 after:border-t after:border-muted-foreground/30 after:content-['']"
										}`}
									>
										<span className="block min-w-0 flex-1 truncate">{word}</span>
									</motion.button>
								);
							})}
						</motion.div>
					</div>
				))}
			</motion.div>
		</div>
	);
}
