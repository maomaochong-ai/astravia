import { AGENT_MODES, AGENT_MODE_ICONS } from "@shared/components/AgentModeSwitcher";
import { useAgentMode } from "@shared/hooks/useAgentMode";
import { cn } from "@shared/lib/utils";
import { useTranslation } from "react-i18next";

/**
 * 新会话欢迎区专用：胶囊形工作/编程切换。
 * 当前选中段在 icon 右侧展示 Label（Work/Coding）；未选中仅 icon。
 * 不改动共享 AgentModeSwitcher（设置菜单等仍用带文案的分段样式）。
 */
export function AgentModeIconToggle({ className }: { className?: string }): JSX.Element {
	const { t } = useTranslation("settings");
	const { agentMode, setAgentMode } = useAgentMode();

	return (
		<div
			role="group"
			aria-label={t("agentMode.title")}
			className={cn(
				"relative inline-flex h-7 shrink-0 items-center rounded-full border border-primary/40 p-0.5",
				className,
			)}
		>
			{AGENT_MODES.map((mode) => {
				const active = mode === agentMode;
				const label = t(`agentMode.${mode}`);
				return (
					<button
						key={mode}
						type="button"
						onClick={() => void setAgentMode(mode)}
						aria-label={label}
						aria-pressed={active}
						title={label}
						className={cn(
							"relative z-10 flex h-6 items-center justify-center rounded-full transition-[color,background-color,padding] duration-200 ease-out",
							active
								? "gap-1 bg-primary px-2 text-primary-foreground"
								: "w-7 text-muted-foreground hover:text-foreground",
						)}
					>
						<span className={cn(AGENT_MODE_ICONS[mode], "h-3.5 w-3.5 shrink-0")} aria-hidden />
						{active && <span className="text-[11px] font-medium leading-none">{label}</span>}
					</button>
				);
			})}
		</div>
	);
}

