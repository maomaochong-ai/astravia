import type { ModelsConfigData } from "@preload/api.js";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PresetProvidersSection } from "@domains/settings/components/PresetProvidersSection";

/**
 * 首启向导的「配置模型」步骤。
 *
 * 本版本没有登录、也不连任何模型网关，用户必须自带 Key（BYOK）才有可用模型；
 * 这一步就是把设置页的[[预设服务商]]区段前置到首启，避免新用户装完发第一条
 * 消息时才发现无模型可用。可跳过——用户随时能去「设置 → 模型配置」补。
 */
export function ModelsStep(): JSX.Element {
	const { t } = useTranslation("common");
	const [config, setConfig] = useState<ModelsConfigData | null>(null);

	useEffect(() => {
		void window.astravia.models.get().then(setConfig);
	}, []);

	const saveConfig = useCallback(async (next: ModelsConfigData) => {
		await window.astravia.models.set(next);
		setConfig(next);
	}, []);

	return (
		<div className="mx-auto flex w-full max-w-[460px] flex-col gap-4">
			<div className="text-center">
				<div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-border/50 bg-card/40">
					<span className="icon-[mdi--brain] h-6 w-6 text-primary" />
				</div>
				<h2 className="text-[15px] font-semibold text-foreground">{t("setupWizard.models.title")}</h2>
				<p className="mt-1 text-[12px] text-muted-foreground">{t("setupWizard.models.subtitle")}</p>
			</div>

			<div className="max-h-[46vh] overflow-y-auto">
				{config && <PresetProvidersSection config={config} saveConfig={saveConfig} />}
			</div>

			<p className="text-center text-[11px] text-muted-foreground/70">{t("setupWizard.models.optionalHint")}</p>
		</div>
	);
}
