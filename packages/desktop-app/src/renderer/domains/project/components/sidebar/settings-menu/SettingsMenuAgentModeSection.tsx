import { AgentModeSwitcher } from "@shared/components/AgentModeSwitcher";
import { useTranslation } from "react-i18next";

/**
 * 工作模式切换（agent_mode 轴，见 ADR-0046）。复用共享滑块分段切换器 AgentModeSwitcher。
 */
export function SettingsMenuAgentModeSection(): JSX.Element {
	const { t } = useTranslation("settings");
	return (
		<div className="px-1.5 py-1">
			<div className="mb-1 px-0.5 text-[10px] font-medium text-muted-foreground">{t("agentMode.title")}</div>
			<AgentModeSwitcher />
		</div>
	);
}
