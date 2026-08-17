import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SETTINGS_SECTION } from "../registry";
import { SegmentedControl } from "@astravia/theme-ui/shared";
import { BuiltinMcpSection } from "./BuiltinMcpSection";
import { McpServerRow } from "./McpServerRow";
import type { McpSettingsModel } from "./useMcpSettingsModel";

type McpStoreTab = "mine" | "discover";

const MCP_GRID_CLASS = "grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2.5";

/** 已添加 MCP 宫格（「我的」）。 */
function McpMineGrid({ model }: { model: McpSettingsModel }): JSX.Element {
	const { t } = useTranslation("settings");
	const names = model.serverNames;
	const section = SETTINGS_SECTION["mcp-server-list-builtin"];

	return (
		<section
			id={section.id}
			data-setting-section-id={section.id}
			data-setting-section-highlight-target={section.id}
		>
			{names.length === 0 ? (
				<div className="rounded-xl bg-card px-5 py-10 text-center text-[12px] text-muted-foreground">
					{t("mcpStore.installedEmpty")}
				</div>
			) : (
				<div className={MCP_GRID_CLASS}>
					{names.map((name) => (
						<McpServerRow key={name} name={name} model={model} />
					))}
				</div>
			)}
		</section>
	);
}

/** 发现：客户端内置的推荐连接器目录。 */
function McpDiscoverBody({ model }: { model: McpSettingsModel }): JSX.Element {
	const { t } = useTranslation("settings");

	return (
		<section>
			<div className="mb-3 min-w-0">
				<div className="text-[13px] font-semibold text-foreground">{t("mcpStore.sectionRecommended")}</div>
				<p className="mt-0.5 text-[11px] text-muted-foreground">{t("mcpStore.sectionRecommendedHint")}</p>
			</div>
			<BuiltinMcpSection
				variant="discover"
				addedNames={model.addedServerNames}
				onAdd={(preset) => {
					void model.onAddBuiltinServer(preset);
				}}
				onRemove={model.onRemoveRemoteServer}
				busyName={model.busyPresetName}
			/>
		</section>
	);
}

/**
 * 连接器统一列表：右侧 Toggle「发现 | 我的」。
 * - 发现：客户端内置推荐目录；已添加项仍展示并标「已添加」
 * - 我的：已添加 MCP
 */
export function McpStorePanel({ model }: { model: McpSettingsModel }): JSX.Element {
	const { t } = useTranslation("settings");
	const [tab, setTab] = useState<McpStoreTab>("discover");

	return (
		<section>
			<div className="mb-4 flex flex-wrap items-center justify-between gap-3">
				<div className="min-w-0">
					<div className="text-[15px] font-semibold text-foreground">
						{tab === "mine" ? t("mcpStore.mineTitle") : t("mcpStore.discoverTitle")}
					</div>
					<p className="mt-0.5 text-[11px] text-muted-foreground">
						{tab === "mine" ? t("mcpStore.mineHint") : t("mcpStore.discoverHint")}
					</p>
				</div>
				<SegmentedControl
					items={[
						{ key: "discover" as McpStoreTab, label: t("mcpStore.tabDiscover") },
						{ key: "mine" as McpStoreTab, label: t("mcpStore.tabMine") },
					]}
					value={tab}
					onChange={setTab}
				/>
			</div>

			{tab === "discover" ? <McpDiscoverBody model={model} /> : <McpMineGrid model={model} />}
		</section>
	);
}
