import { motion } from "motion/react";
import type { JSX } from "react";

export interface PluginCardViewModel {
	readonly author?: string;
	readonly description: string;
	readonly downloadCount?: number;
	readonly enabled: boolean;
	readonly installing: boolean;
	readonly isInstalled: boolean;
	readonly isSystem: boolean;
	/** Local zip import or workbench install-from-path (source === "archive"). */
	readonly isCustom: boolean;
	/** Recently installed (host decides window); not for system plugins. */
	readonly isNew: boolean;
	readonly name: string;
	readonly needsUpdate: boolean;
	readonly noDescription: string;
	readonly notInstalledLabel: string;
	readonly statusEnabled: string;
	readonly statusDisabled: string;
	readonly systemBadge: string;
	readonly customBadge: string;
	readonly newBadge: string;
	readonly updatableBadge?: string;
	readonly version: string;
	readonly installLabel: string;
}

export interface PluginCardViewProps {
	readonly model: PluginCardViewModel;
	readonly onSelect: () => void;
	readonly onInstall: () => void;
}

export function PluginCardView({ model, onSelect, onInstall }: PluginCardViewProps): JSX.Element {
	return (
		<motion.div
			variants={{
				hidden: { opacity: 0, y: 10, scale: 0.98 },
				show: { opacity: 1, y: 0, scale: 1 },
			}}
			transition={{ type: "spring", stiffness: 280, damping: 26 }}
			whileHover={{ y: -2 }}
			onClick={() => (model.isInstalled ? onSelect() : onInstall())}
			className="group relative flex cursor-pointer flex-col overflow-hidden rounded-xl bg-card transition-colors duration-200 hover:bg-accent"
		>
			<div className="flex flex-1 flex-col gap-2 px-3.5 pt-3 pb-3">
				<div className="flex items-start gap-2.5">
					<div
						className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
							model.isInstalled && model.enabled
								? "bg-primary/10 text-primary ring-1 ring-inset ring-primary/20"
								: "bg-accent/50 text-muted-foreground/70"
						}`}
					>
						<span className="icon-[mdi--puzzle-outline] h-4 w-4" />
					</div>
					<div className="min-w-0 flex-1">
						<div className="flex items-baseline gap-2">
							<h4 className="truncate text-[13px] font-semibold tracking-tight text-foreground">
								{model.name}
							</h4>
							<span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/45">
								v{model.version}
							</span>
						</div>
						<p className="mt-0.5 line-clamp-2 text-[12px] leading-[1.5] text-muted-foreground/65">
							{model.description || model.noDescription}
						</p>
					</div>
				</div>

				<div className="mt-auto flex items-center gap-2 pt-2">
					<div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
						{model.isInstalled ? (
							<span
								className={`inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-[10px] font-semibold ${
									model.enabled
										? "bg-emerald-500/15 text-emerald-400"
										: "bg-amber-500/15 text-amber-400"
								}`}
							>
								<span
									className={`h-1.5 w-1.5 rounded-full ${
										model.enabled ? "bg-emerald-400" : "bg-amber-400"
									}`}
								/>
								{model.enabled ? model.statusEnabled : model.statusDisabled}
							</span>
						) : (
							<span className="inline-flex h-5 shrink-0 items-center rounded-full bg-accent/60 px-2 text-[10px] font-semibold text-muted-foreground">
								{model.notInstalledLabel}
							</span>
						)}
						{model.isNew && (
							<span className="inline-flex h-5 shrink-0 items-center rounded-full bg-primary/10 px-2 text-[10px] font-semibold text-primary">
								{model.newBadge}
							</span>
						)}
						{model.isSystem && (
							<span className="inline-flex h-5 shrink-0 items-center rounded-full bg-primary/10 px-2 text-[10px] font-semibold text-primary">
								{model.systemBadge}
							</span>
						)}
						{model.isCustom && (
							<span className="inline-flex h-5 shrink-0 items-center rounded-full bg-primary/10 px-2 text-[10px] font-semibold text-primary">
								{model.customBadge}
							</span>
						)}
						{model.needsUpdate && model.updatableBadge && (
							<span className="inline-flex h-5 shrink-0 items-center rounded-full bg-amber-500/15 px-2 text-[10px] font-semibold text-amber-500">
								{model.updatableBadge}
							</span>
						)}
						{!model.isInstalled && model.downloadCount !== undefined && (
							<span className="inline-flex h-5 shrink-0 items-center gap-0.5 text-[10px] font-medium tabular-nums text-muted-foreground/70">
								<span className="icon-[mdi--download] h-3 w-3" />
								{model.downloadCount}
							</span>
						)}
						{model.author && (
							<span className="truncate text-[11px] text-muted-foreground/55">{model.author}</span>
						)}
					</div>
					{model.isInstalled ? (
						<span className="icon-[mdi--chevron-right] h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5" />
					) : (
						<button
							type="button"
							disabled={model.installing}
							onClick={(e) => {
								e.stopPropagation();
								onInstall();
							}}
							className="flex shrink-0 items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
						>
							{model.installing ? (
								<span className="icon-[mdi--loading] h-3.5 w-3.5 animate-spin" />
							) : (
								<span className="icon-[mdi--download] h-3.5 w-3.5" />
							)}
							{model.installLabel}
						</button>
					)}
				</div>
			</div>
		</motion.div>
	);
}
