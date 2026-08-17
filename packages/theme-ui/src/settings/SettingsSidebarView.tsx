import type { JSX } from "react";
import { cn } from "@astravia/ui";

export interface SettingsSidebarTabItem {
	readonly beta?: boolean;
	readonly icon: string;
	readonly key: string;
	readonly label: string;
	readonly title?: string;
}

export interface SettingsSidebarViewProps {
	readonly activeTab: string;
	readonly betaBadgeLabel: string;
	readonly narrow: boolean;
	readonly onSelectTab: (tab: string) => void;
	readonly tabs: readonly SettingsSidebarTabItem[];
	readonly title: string;
}

export function SettingsSidebarView({
	activeTab,
	betaBadgeLabel,
	narrow,
	onSelectTab,
	tabs,
	title,
}: SettingsSidebarViewProps): JSX.Element {
	return (
		<div className={cn("flex shrink-0 flex-col", narrow ? "w-14" : "w-[200px]")}>
			<div className={cn("drag-region", narrow ? "h-12" : "px-5 pb-2 pt-2")}>
				{!narrow && <h1 className="text-[20px] font-bold text-foreground">{title}</h1>}
			</div>
			<nav className={cn("flex flex-col gap-0.5", narrow ? "px-2" : "px-2.5")}>
				{tabs.map((item) => (
					<button
						key={item.key}
						type="button"
						title={item.title}
						onClick={() => onSelectTab(item.key)}
						className={cn(
							"flex items-center rounded-lg text-[13px] font-medium transition-colors",
							narrow ? "justify-center px-0 py-2" : "gap-2.5 px-2.5 py-[7px]",
							activeTab === item.key
								? "bg-accent text-foreground"
								: "text-foreground hover:bg-accent/50",
						)}
					>
						<span className={cn(item.icon, "h-4 w-4 shrink-0")} />
						{!narrow && <span className="flex-1 text-left">{item.label}</span>}
						{!narrow && item.beta && (
							<span className="rounded-full border border-primary/40 px-1.5 py-px text-[9px] font-semibold uppercase leading-tight tracking-wide text-primary">
								{betaBadgeLabel}
							</span>
						)}
					</button>
				))}
			</nav>
		</div>
	);
}
