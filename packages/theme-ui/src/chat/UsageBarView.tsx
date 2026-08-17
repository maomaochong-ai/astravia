import { motion } from "motion/react";
import type { JSX } from "react";

export interface UsageBarViewProps {
	text: string;
}

export function UsageBarView({ text }: UsageBarViewProps): JSX.Element {
	return (
		<motion.div
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			transition={{ duration: 0.3 }}
			className="flex justify-start pl-7"
		>
			<div className="text-[11px] font-mono text-muted-foreground/50">{text}</div>
		</motion.div>
	);
}
