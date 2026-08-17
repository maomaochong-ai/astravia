import { useAgentMode } from "@shared/hooks/useAgentMode";
import { cn } from "@shared/lib/utils";
import type { AgentMode } from "@shared/store/atoms";
import { useTranslation } from "react-i18next";

export const AGENT_MODES: readonly AgentMode[] = ["work", "coding"];

export const AGENT_MODE_ICONS: Record<AgentMode, string> = {
	work: "icon-[solar--case-minimalistic-linear]",
	coding: "icon-[solar--code-linear]",
};

/**
 * 工作模式分段切换器（agent_mode 轴，见 ADR-0046）。
 * 顶栏 badge popover、底部设置菜单等处共用（新会话页使用独立 AgentModeIconToggle）。
 * 容器（背景）为 outline 描边、无填充；选中项为实心滑块。圆角走主题 --radius（rounded-lg/md）。
 */
export function AgentModeSwitcher({ className }: { className?: string }): JSX.Element {
	const { t } = useTranslation("settings");
	const { agentMode, setAgentMode } = useAgentMode();
	const activeIndex = Math.max(0, AGENT_MODES.indexOf(agentMode));

	return (
		<div className={cn("relative flex h-8 w-full items-center rounded-lg border border-primary/40 p-0.5", className)}>
			<div
				aria-hidden
				className="absolute top-0.5 bottom-0.5 rounded-md bg-primary transition-[left] duration-200 ease-out"
				style={{ width: "calc(50% - 2px)", left: activeIndex === 0 ? "2px" : "50%" }}
			/>
			{AGENT_MODES.map((mode) => {
				const active = mode === agentMode;
				return (
					<button
						key={mode}
						type="button"
						onClick={() => void setAgentMode(mode)}
						className={cn(
							"relative z-10 flex flex-1 items-center justify-center gap-1 rounded-md text-center text-[11px] font-semibold transition-colors",
							active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",
						)}
					>
						<span className={cn(AGENT_MODE_ICONS[mode], "h-3.5 w-3.5 shrink-0")} />
						{t(`agentMode.${mode}`)}
					</button>
				);
			})}
		</div>
	);
}
