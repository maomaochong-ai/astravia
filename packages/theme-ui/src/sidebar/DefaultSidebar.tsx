import type { JSX, ReactNode } from "react";
import { useThemeComponent } from "@astravia/theme-sdk";
import type { SidebarClassNames, SidebarModel } from "@astravia/theme-sdk/sidebar";
import { cn } from "@astravia/ui";
import { ThemeSurface } from "../appearance/ThemeSurface";
import { SidebarNavigation } from "./SidebarNavigation";
import { SidebarPanel } from "./SidebarPanel";

export interface DefaultSidebarProps {
	bottomBar: ReactNode;
	classNames?: SidebarClassNames;
	model: SidebarModel;
	projects: ReactNode;
	topBar: ReactNode;
}

/**
 * Props-driven sidebar shell. Host supplies connected section trees via topBar / projects / bottomBar.
 * Navigation is composed here from model so component overrides (`sidebar.navigation`) still apply.
 */
export function DefaultSidebar({
	bottomBar,
	classNames,
	model,
	projects,
	topBar,
}: DefaultSidebarProps): JSX.Element {
	const ThemedSidebarNavigation = useThemeComponent("sidebar.navigation", SidebarNavigation);

	return (
		<SidebarPanel
			className={classNames?.panel}
			contentClassName={classNames?.panelContent}
			width={model.width}
			onResize={model.actions.resize}
			onResizeEnd={model.actions.resizeEnd}
		>
			<div className={cn("relative shrink-0", classNames?.topBar)} data-theme-surface-root="sidebar.topBar">
				<ThemeSurface slot="sidebar.topBar" />
				<div className="relative z-10 overflow-hidden rounded-[inherit]">{topBar}</div>
			</div>
			<div className={cn("relative shrink-0", classNames?.navigation)} data-theme-surface-root="sidebar.navigation">
				<ThemeSurface slot="sidebar.navigation" />
				<div className="relative z-10 overflow-hidden rounded-[inherit]">
					<ThemedSidebarNavigation
						classNames={{
							indicator: classNames?.navIndicator,
							item: classNames?.navItem,
							itemBadge: classNames?.navItemBadge,
							itemIcon: classNames?.navItemIcon,
							itemLabel: classNames?.navItemLabel,
						}}
						items={model.navItems}
						indicatorBounds={model.navIndicatorBounds}
						moreActive={model.moreActive}
						moreItems={model.moreNavItems}
						moreLabel={model.moreLabel}
						moreOpen={model.moreOpen}
						onItemClick={model.actions.openNavItem}
						onMoreOpenChange={model.actions.setMoreOpen}
						setItemRef={model.setNavItemRef}
						setMoreButtonRef={model.setMoreButtonRef}
					/>
				</div>
			</div>
			<div
				className={cn("relative flex min-h-0 flex-1 flex-col", classNames?.projects)}
				data-theme-surface-root="sidebar.projects"
			>
				<ThemeSurface slot="sidebar.projects" />
				<div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[inherit]">
					{projects}
				</div>
			</div>
			<div className={cn("relative shrink-0", classNames?.bottomBar)} data-theme-surface-root="sidebar.bottomBar">
				<ThemeSurface slot="sidebar.bottomBar" />
				<div className="relative z-10 overflow-hidden rounded-[inherit]">{bottomBar}</div>
			</div>
		</SidebarPanel>
	);
}
