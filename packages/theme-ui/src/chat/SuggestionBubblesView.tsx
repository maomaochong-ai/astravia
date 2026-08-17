import { AnimatePresence, motion } from "motion/react";
import type { JSX } from "react";

export interface SuggestionBubblesViewProps {
	suggestions: readonly string[];
	sendTooltip: string;
	onSend: (text: string) => void;
}

const BUBBLE_INITIAL = { opacity: 0, y: 6 };
const BUBBLE_ANIMATE = { opacity: 1, y: 0 };
const BUBBLE_EXIT = { opacity: 0, y: 4 };
const SOFT = { duration: 0.18, ease: [0.22, 0.61, 0.36, 1] as const };

/**
 * 输入预测建议气泡：垂直排列 0-3 个。建议为空时仅渲染占位壳 + AnimatePresence。
 */
export function SuggestionBubblesView({
	suggestions,
	sendTooltip,
	onSend,
}: SuggestionBubblesViewProps): JSX.Element {
	return (
		<div className="mx-auto w-full max-w-3xl px-5">
			<div className="w-full">
				<AnimatePresence initial={false}>
					{suggestions.length > 0 && (
						<motion.div
							key="suggestion-bubbles"
							initial={{ opacity: 0, height: 0 }}
							animate={{ opacity: 1, height: "auto" }}
							exit={{ opacity: 0, height: 0 }}
							transition={SOFT}
							className="mt-3 flex flex-col items-start gap-1.5 overflow-hidden pt-1 pb-2"
						>
							{suggestions.map((s, i) => (
								<motion.button
									key={`${i}-${s}`}
									type="button"
									initial={BUBBLE_INITIAL}
									animate={BUBBLE_ANIMATE}
									exit={BUBBLE_EXIT}
									transition={{ ...SOFT, delay: i * 0.03 }}
									onClick={() => onSend(s)}
									title={sendTooltip}
									className="group flex max-w-full items-center gap-1.5 rounded-full border border-border/70 bg-card px-3 py-1.5 text-left text-[12.5px] text-muted-foreground transition-colors hover:border-primary/30 hover:bg-accent/60 hover:text-foreground"
								>
									<span className="icon-[solar--magic-stick-3-linear] h-3.5 w-3.5 shrink-0 text-primary/70" />
									<span className="truncate">{s}</span>
								</motion.button>
							))}
						</motion.div>
					)}
				</AnimatePresence>
			</div>
		</div>
	);
}
