import type { JSX } from "react";
import { useCallback, useEffect, useState } from "react";
import { Button, cn, Spin } from "@astravia/ui";
import { useAtomValue, useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "@tanstack/react-router";
import type { ActivityTabKey } from "@shared/lib/project-profile";
import {
	activeSessionAtom,
	activityPanelOpenAtom,
	activityPanelTabByProjectAtom,
	setActivityPanelWidthAtom,
} from "@shared/store/atoms";
import { SettingsAiAssist } from "../../settings/ai-assist";
import { recordSettingsUsage } from "../../settings/components/recordSettingsUsage";
import { DatabaseConnectionDetails } from "./DatabaseConnectionDetails";
import { DatabaseConnectionForm } from "./DatabaseConnectionForm";
import { DatabaseDetail } from "./DatabaseDetail";
import { DatabaseListHeader } from "./DatabaseListHeader";
import { DatabaseNotice } from "./DatabaseNotice";
import { DatabaseSectionLabel } from "./DatabaseSectionLabel";
import { DatabaseStatusDot } from "./DatabaseStatus";
import { DatabaseTypeBadge } from "./DatabaseTypeBadge";
import { DatabaseWorkspaceHeader } from "./DatabaseWorkspaceHeader";
import { DbxToolAccessRow, SchemaInjectionRow } from "./database-details-shared";
import { useDatabaseWorkspaceModel } from "./useDatabaseWorkspaceModel";

/**
 * 数据库连接配置管理（B2.6-R 职责分离后 /database 页面与设置页数据库 tab 的视图）：
 * 全局配置区（AI 数据库感知开关 + 引擎说明）+ 连接管理区（列表 / 新增 / 编辑 / 删除 / 测试连接），
 * 不含三栏经典数据库工具界面（后者迁至活动面板「数据库」标签页）。
 *
 * B2.6-U U1/U3：头部收敛为共享 page 头部；连接详情按管理视角独立实现。
 * B2.6-V V1：新增全局配置区（开关上移自连接详情）+ 头部「打开数据库工作台」入口。
 */
export function DatabaseConnectionsWorkspace(): JSX.Element {
	const { t } = useTranslation("settings");
	const model = useDatabaseWorkspaceModel();
	const selected = model.selected;

	const activeSession = useAtomValue(activeSessionAtom);
	const setPanelOpen = useSetAtom(activityPanelOpenAtom);
	const setTabByProject = useSetAtom(activityPanelTabByProjectAtom);
	const setPanelWidth = useSetAtom(setActivityPanelWidthAtom);
	const navigate = useNavigate();
	const location = useLocation();

	// B2.6-V V1：设置页头部入口 → 激活活动面板「数据库」标签页（数据工作台）。
	// 复用 B2.7 对话→界面的 atom 机制；目标连接/表不传递（仅打开工作台）。
	// B2.6-W 反馈 1：ActivityPanel 仅挂载于聊天/项目/查看器路由，设置页与 /database 路由
	// 无组件消费面板 atom → 先导航到聊天视图再激活，否则视觉无反应。
	// B2.6-W 复测修复：导航是异步的，且设置页可能没有 activeSession（直接启动进设置）；
	// 点击瞬间预写的 cwd（activeSession?.cwd ?? defaultConversationCwd）与导航完成后
	// ActivityPanel 实际读取的 cwd（导航后恢复的 activeSession?.cwd）可能不一致，
	// defaultConversationCwd 未就绪时甚至是空串导致完全不写入 → 改为先导航/开面板，
	// 待会话 cwd 就绪（与面板同源）后再写入目标 tab。
	const [pendingOpen, setPendingOpen] = useState(false);
	const openWorkbench = useCallback(() => {
		const hasActivityPanel =
			location.pathname === "/" ||
			location.pathname.startsWith("/project/") ||
			location.pathname.startsWith("/viewer/");
		if (!hasActivityPanel) void navigate({ to: "/" });
		setPendingOpen(true);
		setPanelWidth("max");
		setPanelOpen(true);
		recordSettingsUsage({ tab: "database", action: "selected", target: "workbench-entry" });
	}, [location.pathname, navigate, setPanelOpen, setPanelWidth]);

	useEffect(() => {
		if (!pendingOpen) return;
		const cwd = activeSession?.cwd;
		if (!cwd) return; // 会话未就绪（跨路由导航恢复中），等 cwd 出现后再写入。
		setPendingOpen(false);
		setTabByProject((prev) => {
			const map = new Map(prev);
			map.set(cwd, "database" as ActivityTabKey);
			return map;
		});
	}, [activeSession?.cwd, pendingOpen, setTabByProject]);

	return (
		<div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-background">
			<DatabaseWorkspaceHeader
				variant="page"
				title={t("databaseTitle")}
				subtitle={t("databaseSubtitle")}
				actions={
					<>
						<Button variant="outline" size="sm" onClick={openWorkbench}>
							<span className="icon-[solar--database-linear] h-4 w-4" />
							{t("databaseOpenWorkbench")}
						</Button>
						<SettingsAiAssist tabId="database" triggerLabel={t("databaseConnectionAssistant")} />
						<Button variant="ghost" size="sm" onClick={() => void model.actions.refresh()}>
							<span className="icon-[mdi--refresh] h-4 w-4" />
							{t("databaseRefresh")}
						</Button>
						<Button variant="primary" size="sm" onClick={model.actions.openAdd}>
							<span className="icon-[mdi--plus] h-4 w-4" />
							{t("databaseAddConnection")}
						</Button>
					</>
				}
			/>

			<div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-8 pb-6 pt-5">
				<section className="shrink-0">
					<DatabaseSectionLabel icon="icon-[mdi--cog-outline]">{t("databaseSectionGlobal")}</DatabaseSectionLabel>
					<div className="mt-3 flex flex-col gap-3">
						<SchemaInjectionRow model={model} />
						<DbxToolAccessRow model={model} />
						<DatabaseNotice tone="info" icon="icon-[mdi--shield-lock-outline]" title={t("databaseEngineNote")} />
					</div>
				</section>

				<div className="flex min-h-0 flex-1 gap-5">
					<aside className="flex w-[280px] shrink-0 flex-col overflow-hidden rounded-xl bg-muted/40">
						<DatabaseListHeader label={t("databaseConnections")} count={model.connections.length} />
						<div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
							{model.error ? (
								<div className="px-1 pt-1">
									<DatabaseNotice tone="error" title={model.error}>
										{model.errorDetail ? <DatabaseDetail>{model.errorDetail}</DatabaseDetail> : null}
									</DatabaseNotice>
								</div>
							) : model.loading ? (
								<div className="space-y-1.5 px-1 pt-1">
									{[0, 1, 2].map((i) => (
										<div key={i} className="h-[52px] animate-pulse rounded-lg bg-background/70" />
									))}
								</div>
							) : model.connections.length === 0 ? (
								<div className="flex flex-col items-center gap-2 px-4 pt-8 text-center">
									<span className="icon-[mdi--database-plus-outline] h-7 w-7 text-muted-foreground/50" />
									<p className="text-[12px] leading-relaxed text-muted-foreground">{t("databaseEmpty")}</p>
									<Button variant="outline" size="xs" onClick={model.actions.openAdd}>
										<span className="icon-[mdi--plus] h-3 w-3" />
										{t("databaseAddConnection")}
									</Button>
								</div>
							) : (
								<div className="space-y-0.5">
									{model.connections.map((connection) => {
										const active = connection.name === selected?.name;
										return (
											<button
												key={connection.id}
												type="button"
												onClick={() => model.actions.select(connection.name)}
												className={cn(
													"flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-left",
													active ? "bg-background shadow-sm" : "hover:bg-background/60",
												)}
											>
												<DatabaseStatusDot status={model.testSnapshots[connection.name]?.status ?? "untested"} />
												<DatabaseTypeBadge type={connection.type} size="sm" />
												<span className="min-w-0 truncate text-[12.5px] font-semibold text-foreground">
													{connection.name}
												</span>
											</button>
										);
									})}
								</div>
							)}
						</div>
					</aside>

					<main className="min-w-0 flex-1 overflow-y-auto rounded-xl bg-muted/40 px-4 py-4">
						{selected ? (
							<DatabaseConnectionDetails model={model} selected={selected} />
						) : (
							<div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
								<div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
									<span className="icon-[solar--database-linear] h-8 w-8" />
								</div>
								<h2 className="text-[17px] font-bold text-foreground">{t("databaseEmptyTitle")}</h2>
								<p className="max-w-[360px] text-[12.5px] leading-relaxed text-muted-foreground">
									{t("databaseEmptyDescription")}
								</p>
								<Button variant="primary" size="sm" onClick={model.actions.openAdd}>
									<span className="icon-[mdi--plus] h-4 w-4" />
									{t("databaseAddConnection")}
								</Button>
							</div>
						)}
					</main>
				</div>
			</div>

			<DatabaseConnectionForm
				open={model.addOpen}
				busy={model.formBusy}
				testing={model.formTesting}
				error={model.formError}
				errorDetail={model.formErrorDetail}
				testResult={model.formTestResult}
				form={model.form}
				onChange={model.actions.changeForm}
				onCancel={model.actions.cancelAdd}
				onPickFile={model.actions.pickFile}
				onSave={() => void model.actions.submitAdd()}
				onTest={() => void model.actions.testDraft()}
			/>
		</div>
	);
}
