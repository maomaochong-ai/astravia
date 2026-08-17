import { motion } from "motion/react";
import { useId, type JSX } from "react";

function cn(...parts: Array<string | false | null | undefined>): string {
	return parts.filter(Boolean).join(" ");
}

export interface SegmentedControlItem<T extends string> {
	key: T;
	label: string;
	icon?: string;
	/** 可选未读小红点（>0 显示） */
	badge?: number;
}

export interface SegmentedControlProps<T extends string> {
	items: SegmentedControlItem<T>[];
	value: T;
	onChange: (value: T) => void;
	className?: string;
	/** 容器尺寸正在变化时设为 true，禁用指示器的 layout 动画，避免抖动 */
	suppressLayoutAnimation?: boolean;
}

export function SegmentedControl<T extends string>({
	items,
	value,
	onChange,
	className,
	suppressLayoutAnimation = false,
}: SegmentedControlProps<T>): JSX.Element {
	const layoutId = useId();

	return (
		<div
			className={cn(
				"relative inline-flex shrink-0 rounded-[8px] bg-black/[0.06] p-[2px] dark:bg-white/[0.08]",
				className,
			)}
		>
			{items.map(({ key, label, icon, badge }) => {
				const active = value === key;
				return (
					<button
						key={key}
						type="button"
						onClick={() => onChange(key)}
						className={cn(
							"relative flex shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-[6px] px-2.5 py-[3px] text-[11px] font-medium leading-[16px] transition-colors duration-150 select-none",
							active ? "text-foreground" : "text-muted-foreground hover:text-foreground/70",
						)}
					>
						{active && (
							<motion.span
								layoutId={`seg-indicator-${layoutId}`}
								className="absolute inset-0 rounded-[6px] bg-background shadow-[0_1px_2px_rgba(0,0,0,0.06),0_0_0_0.5px_rgba(0,0,0,0.04)] ring-[0.5px] ring-inset ring-primary/30 dark:bg-white/[0.12] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2)]"
								transition={
									suppressLayoutAnimation
										? { duration: 0 }
										: { type: "spring", stiffness: 480, damping: 32, mass: 0.8 }
								}
							/>
						)}
						<motion.span
							className="relative z-10 flex items-center gap-1"
							whileTap={{ scale: 0.93 }}
							transition={{ type: "spring", stiffness: 500, damping: 24 }}
						>
							{icon && <span className={cn(icon, "h-3 w-3")} />}
							{label}
							{badge && badge > 0 ? (
								<span className="ml-0.5 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-semibold leading-none text-white">
									{badge > 99 ? "99+" : badge}
								</span>
							) : null}
						</motion.span>
					</button>
				);
			})}
		</div>
	);
}
