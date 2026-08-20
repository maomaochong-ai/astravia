import type { JSX, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, cn, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@astravia/ui";
import { ResizeHandle } from "@astravia/theme-ui";
import { useAtomValue, useSetAtom } from "jotai";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { i18n } from "@shared/i18n";
import { TabBar } from "@shared/components/ui/tab-bar";
import { useNarrowScreen } from "@shared/hooks/useNarrowScreen";
import { activityPanelWidthAtom, confirmDialogAtom } from "@shared/store/atoms";
import type { DatabaseTabTarget } from "@shared/store/atoms";
import { DatabaseConnectionDetailsWorkbench } from "./DatabaseConnectionDetailsWorkbench";
import { DatabaseConnectionForm } from "./DatabaseConnectionForm";
import { DatabaseDetail } from "./DatabaseDetail";
import { DatabaseExplorerTree } from "./DatabaseExplorerTree";
import { DatabaseListHeader } from "./DatabaseListHeader";
import { DatabaseNotice } from "./DatabaseNotice";
import { DatabaseQueryPanel } from "./DatabaseQueryPanel";
import { DatabaseResultGrid } from "./DatabaseResultGrid";
import { DatabaseSectionLabel } from "./DatabaseSectionLabel";
import { DatabaseStatusPill } from "./DatabaseStatus";
import { DatabaseTypeBadge } from "./DatabaseTypeBadge";
import { DatabaseWorkspaceHeader } from "./DatabaseWorkspaceHeader";
import { SettingsAiAssist } from "../../settings/ai-assist";
import { recordSettingsUsage } from "../../settings/components/recordSettingsUsage";
import { describeTable, executeQuery, getSchemaContext } from "../lib/database-api";
import { formatDatabaseError } from "../lib/database-error-labels";
import { buildDeleteSql, buildInsertSql, buildRowWhere, buildUpdateSql } from "../lib/sql-dialect";
import { analyzeEditableQuery, type EditableQueryAnalysis } from "../lib/sql-editability";
import { resolveDatabaseLayout } from "./database-layout";
import { useDatabaseAnalyzeResult } from "./useDatabaseAnalyzeResult";
import { useDatabaseAnalyzeTable } from "./useDatabaseAnalyzeTable";
import { useDatabaseExplorerModel } from "./useDatabaseExplorerModel";
import { useDatabaseQueryModel } from "./useDatabaseQueryModel";
import { useDatabaseWorkspaceModel } from "./useDatabaseWorkspaceModel";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

const TREE_WIDTH_DEFAULT = 280;
const TREE_WIDTH_MIN = 200;
const TREE_WIDTH_MAX = 380;

/**
 * 三栏经典数据库工具界面（B2.6-R 后挂载于活动面板「数据库」标签页，数据工作台）：
 * 左栏 连接→表→列 懒加载树；中栏 SQL 查询面板 + 结果网格；右栏 连接详情。
 *
 * 头部（B2.6-U U1）：活动面板 tab 栏已承载「数据库」label 与图标，页面内不再重复大标题，
 * 改为紧凑工具条 —— 左侧当前连接上下文（类型/名称/状态），右侧 icon-only 操作组。
 *
 * 自适应（B2.6-R 优化）：面板宽度可拖到 260px 起，三栏固定 280+320px 会溢出，
 * 因此按宽度分档降级 —— wide 三栏 inline / medium 两栏 + 详情浮层 / narrow 单栏 + 树与详情浮层，
 * 窄面板下树/详情通过 header 按钮以覆盖抽屉打开，中栏始终完整可用。
 */
interface DatabaseWorkspaceProps {
	/** 对话→界面（B2.7）：激活活动面板数据库标签页时自动选中并打开该连接/表。 */
	initialConnection?: string;
	initialTable?: string;
	/** B2.9-W1：AI 对话中 dbx_execute_query 成功的一次性同步目标（SQL/结果回填）。 */
	syncTarget?: DatabaseTabTarget | null;
	/** B2.9-W1/V6-①：工作台消费完 syncTarget（或确认无法消费）后通知上层清空 atom，
	 *  避免「挂载即清空」竞态丢回填，也避免无法消费时 atom 残留导致下次重复跳转。 */
	onSyncTargetApplied?: () => void;
}

export function DatabaseWorkspace({
	initialConnection,
	initialTable,
	syncTarget,
	onSyncTargetApplied,
}: DatabaseWorkspaceProps): JSX.Element {
	const { t } = useTranslation("settings");
	const model = useDatabaseWorkspaceModel();
	const analyzeTable = useDatabaseAnalyzeTable();
	const analyzeResult = useDatabaseAnalyzeResult();
	const query = useDatabaseQueryModel();
	// B2.9-W1 反向：结果网格「让 AI 解读此查询」需要当前 SQL + 结果。提取 const 局部变量，
	// 闭包内捕获 const 局部变量可保留 TS 收窄（直接读 query.result / 对象属性会丢失收窄）。
	const lastResult = query.result;
	const lastResultSql = query.resultSql;
	// B3.2 数据编辑：结果列名（无主键时退化为整行等值匹配定位）。const 局部变量保留 TS 收窄。
	const lastResultColumns = query.result?.columns ?? [];
	// B3.2-R 自由 SQL 可编辑性：仅简单单表 SELECT 结果可回写（对齐 dbx sql_editability）。
	const editability = useMemo<EditableQueryAnalysis>(
		() => (lastResultSql ? analyzeEditableQuery(lastResultSql) : { editable: false, reason: "not-select" }),
		[lastResultSql],
	);
	const explorer = useDatabaseExplorerModel();
	const selected = model.selected;
	const setConfirm = useSetAtom(confirmDialogAtom);
	// B3.2 数据编辑：当前打开表的主键列（行级定位）；无主键则禁用编辑（安全默认）。
	const openTableMeta = query.openTableMeta;
	// B3.2-R 编辑目标：打开表 → openTableMeta；自由 SQL → 可编辑性分析通过的单表来源（方言类型用连接类型）。
	const editTarget = useMemo(
		() => openTableMeta ?? (editability.editable && selected ? { type: selected.type, table: editability.info.table } : null),
		[editability, openTableMeta, selected],
	);
	const [pkColumns, setPkColumns] = useState<string[]>([]);
	// B3.2-R 表结构读取状态：loading（describeTable 在飞）/ ready / failed（读取失败需暴露原因，不静默）。
	const [pkState, setPkState] = useState<"loading" | "ready" | "failed">("loading");
	const [writeError, setWriteError] = useState<string | null>(null);

	// 主键加载：编辑目标（打开表或可编辑自由 SQL 的来源表）结果就绪时读取表结构，供单元格编辑/删除行定位 WHERE。
	useEffect(() => {
		if (!selected || !editTarget || query.status !== "success") {
			setPkColumns([]);
			setPkState("loading");
			return;
		}
		let cancelled = false;
		setPkState("loading");
		void describeTable(selected.name, editTarget.table)
			.then((columns) => {
				if (!cancelled) {
					setPkColumns(columns.filter((column) => column.isPrimaryKey).map((column) => column.name));
					setPkState("ready");
				}
			})
			.catch(() => {
				if (!cancelled) {
					setPkColumns([]);
					setPkState("failed");
				}
			});
		return () => {
			cancelled = true;
		};
	}, [editTarget, query.status, selected]);

	// B3.2 写操作执行：确认后执行写 SQL（main 侧仍有 prod 写保护兜底）→ 成功刷新（打开表 reloadOpenTable / 自由 SQL rerun 不推历史）；失败在网格底部展示。
	const runWrite = useCallback(
		async (sql: string) => {
			if (!selected) return;
			try {
				await executeQuery(selected.name, sql);
				setWriteError(null);
				if (query.openTableMeta) {
					await query.actions.reloadOpenTable(selected);
				} else if (query.resultSql) {
					await query.actions.rerun(selected, query.resultSql);
				}
			} catch (caught) {
				const { message, detail } = formatDatabaseError(t, caught);
				setWriteError(detail || message);
			}
		},
		[query.actions, query.openTableMeta, query.resultSql, selected, t],
	);

	const handleSaveCell = useCallback(
		({ row, column, value }: { row: Record<string, string>; column: string; value: string }) => {
			if (!selected || !editTarget) return;
			const where = buildRowWhere(row, pkColumns, lastResultColumns);
			const hasPk = pkColumns.some((pk) => pk in row);
			const sql = buildUpdateSql(editTarget.type, editTarget.table, [{ column, value }], where);
			setConfirm({
				title: t("databaseEditConfirm"),
				message:
					t("databaseEditConfirmMessage", { sql }) +
					(hasPk ? "" : `\n\n${t("databaseEditNoPkWarning")}`),
				confirmLabel: t("databaseEditSave"),
				onConfirm: () => {
					recordSettingsUsage({ tab: "database", action: "changed", target: "data-edit-cell" });
					void runWrite(sql);
				},
			});
		},
		[lastResultColumns, editTarget, pkColumns, runWrite, selected, setConfirm, t],
	);

	const handleAddRow = useCallback(
		({ values }: { values: Record<string, string> }) => {
			if (!selected || !editTarget) return;
			const sql = buildInsertSql(
				editTarget.type,
				editTarget.table,
				Object.keys(values).map((column) => ({ column, value: values[column] })),
			);
			setConfirm({
				title: t("databaseEditConfirmAddRow"),
				message: t("databaseEditConfirmMessage", { sql }),
				confirmLabel: t("databaseEditSave"),
				onConfirm: () => {
					recordSettingsUsage({ tab: "database", action: "changed", target: "data-edit-add-row" });
					void runWrite(sql);
				},
			});
		},
		[editTarget, runWrite, selected, setConfirm, t],
	);

	const handleDeleteRow = useCallback(
		({ row }: { row: Record<string, string> }) => {
			if (!selected || !editTarget) return;
			const where = buildRowWhere(row, pkColumns, lastResultColumns);
			const hasPk = pkColumns.some((pk) => pk in row);
			const sql = buildDeleteSql(editTarget.type, editTarget.table, where);
			setConfirm({
				title: t("databaseEditConfirmDeleteRow"),
				message:
					t("databaseEditConfirmMessage", { sql }) +
					(hasPk ? "" : `\n\n${t("databaseEditNoPkWarning")}`),
				confirmLabel: t("databaseEditDeleteRow"),
				variant: "danger",
				onConfirm: () => {
					recordSettingsUsage({ tab: "database", action: "changed", target: "data-edit-delete-row" });
					void runWrite(sql);
				},
			});
		},
		[lastResultColumns, editTarget, pkColumns, runWrite, selected, setConfirm, t],
	);

	// B2.6-W 反馈 3：工作台「问数」入口 —— 复用 SettingsAiAssist 弹层形态，提交时把
	// 当前连接的 schema 摘要注入 agent instruction（模型可见、用户气泡不可见）。
	const askExtraInstruction = useCallback(async () => {
		if (!selected) return "";
		// B2.9-W3 埋点：工作台「问数」入口提交（含当前连接 schema 注入）。
		recordSettingsUsage({ tab: "database", action: "selected", target: "ask-data" });
		let schema = "";
		try {
			schema = await getSchemaContext(selected.name);
		} catch {
			schema = "";
		}
		return i18n.t("settings:databaseAskData.instruction", {
			connection: selected.name,
			schema: schema || i18n.t("settings:databaseAskData.noSchema"),
		});
	}, [selected]);

	// B2.6-R 自适应：读取活动面板当前宽度；窄屏 bottomSheet 全宽时视为 wide 三栏直出。
	const narrowScreen = useNarrowScreen();
	const panelWidth = useAtomValue(activityPanelWidthAtom);
	const effectiveWidth = narrowScreen ? Number.POSITIVE_INFINITY : panelWidth;
	const layout = useMemo(() => resolveDatabaseLayout(effectiveWidth), [effectiveWidth]);
	const { mode } = layout;
	const compact = mode === "narrow";

	// 手动显隐覆盖：null = 跟随断点自动；false/true = 强制隐藏/显示（仅对 auto 为 false 的栏有意义）。
	const [treeOverride, setTreeOverride] = useState<boolean | null>(null);
	const [detailsOverride, setDetailsOverride] = useState<boolean | null>(null);
	const [treeWidth, setTreeWidth] = useState(TREE_WIDTH_DEFAULT);
	// V5-③ 标签条响应式收纳：放不下的查询标签 key（TabBar 经 onOverflowChange 上报，渲染到「更多」下拉）。
	const [overflowTabIds, setOverflowTabIds] = useState<string[]>([]);

	const showTree = treeOverride ?? layout.autoTree;
	const showDetails = detailsOverride ?? layout.autoDetails;
	const treeAsOverlay = showTree && !layout.autoTree;
	const detailsAsOverlay = showDetails && !layout.autoDetails;

	// 布局档位（wide/medium/narrow）变化后由自动布局接管，清除手动覆盖；
	// 同一档位内允许用户手动开/关（如 wide 下也能用按钮隐藏连接详情）。
	const prevModeRef = useRef(mode);
	useEffect(() => {
		if (prevModeRef.current !== mode) {
			prevModeRef.current = mode;
			setTreeOverride(null);
			setDetailsOverride(null);
		}
	}, [mode]);

	const toggleTree = useCallback(() => setTreeOverride(showTree ? false : true), [showTree]);
	const toggleDetails = useCallback(() => setDetailsOverride(showDetails ? false : true), [showDetails]);
	const closeOverlays = useCallback(() => {
		setTreeOverride(null);
		setDetailsOverride(null);
	}, []);
	const onTreeResize = useCallback((delta: number) => {
		setTreeWidth((currentWidth) => Math.max(TREE_WIDTH_MIN, Math.min(TREE_WIDTH_MAX, currentWidth + delta)));
	}, []);

	// B2.7 对话→界面：连接加载完成后选中目标连接；表存在则展开并自动打开（SELECT *）。
	const initialApplied = useRef(false);
	useEffect(() => {
		if (initialApplied.current) return;
		if (!initialConnection) return;
		const connection = model.connections.find((c) => c.name === initialConnection);
		if (!connection) return;
		initialApplied.current = true;
		model.actions.select(initialConnection);
		if (initialTable) {
			explorer.actions.toggleConnection(initialConnection);
			void query.actions.openTable(connection, initialTable);
		}
	}, [explorer, initialConnection, initialTable, model.connections, model.actions, query.actions]);

	// B2.9-W1 查询同步通道（对话 → 工作台）：AI 对话中 dbx_execute_query 成功后，
	// database-tab 经 databaseTabTargetAtom 一次性传递 { connection, sql, result }，
	// 此处选中连接并回填 SQL/结果（不触发执行）。target 对象引用唯一 → 只应用一次。
	// V6-① 修复：连接列表异步加载（model.loading）期间不放弃目标 —— 就绪后本 effect
	// 重跑并回填；消费成功或确认无法消费（连接不存在 / 纯导航目标）后经
	// onSyncTargetApplied 通知上层清空 atom，防竞态丢回填、防残留重复跳转。
	const lastAppliedSyncRef = useRef<DatabaseTabTarget | null>(null);
	useEffect(() => {
		// 纯导航目标（B2.7 { connection, table }，无 sql）：initial 已由快照 props 消费，
		// 这里确认后通知清空即可。
		if (!syncTarget?.sql) {
			onSyncTargetApplied?.();
			return;
		}
		if (lastAppliedSyncRef.current === syncTarget) return;
		if (model.loading) return; // connections 未就绪：等加载完成后本 effect 重跑
		if (!model.connections.some((c) => c.name === syncTarget.connection)) {
			// 目标连接不在当前列表（已删除等）：无法消费，通知清空防残留。
			onSyncTargetApplied?.();
			return;
		}
		lastAppliedSyncRef.current = syncTarget;
		model.actions.select(syncTarget.connection);
		query.actions.applyResult(
			syncTarget.connection,
			syncTarget.sql,
			syncTarget.result ?? null,
			syncTarget.error ?? null,
			syncTarget.errorDetail ?? null,
		);
		onSyncTargetApplied?.();
	}, [syncTarget, model.connections, model.loading, model.actions, query.actions, onSyncTargetApplied]);

	// V5-③ 查询标签操作：新建 / 切换 / 关闭 / 拖拽排序（V5-④ 目标 tab 路由在模型 actions 内实现）。
	const handleNewTab = () => {
		recordSettingsUsage({ tab: "database", action: "selected", target: "query-tab-new" });
		query.actions.addTab();
	};
	const handleTabChange = (id: string) => {
		if (id === query.activeTabId) return;
		recordSettingsUsage({ tab: "database", action: "selected", target: "query-tab-switch" });
		query.actions.activateTab(id);
	};
	const handleTabClose = (id: string) => {
		recordSettingsUsage({ tab: "database", action: "selected", target: "query-tab-close" });
		query.actions.closeTab(id);
	};
	const handleTabReorder = (ids: string[]) => {
		recordSettingsUsage({ tab: "database", action: "selected", target: "query-tab-reorder" });
		query.actions.reorderTabs(ids);
	};

	const treeBody: ReactNode = model.error ? (
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
		<DatabaseExplorerTree
			connections={model.connections}
			selectedName={selected?.name ?? null}
			explorer={explorer}
			statusOf={(name) => model.testSnapshots[name]?.status ?? "untested"}
			onSelect={model.actions.select}
			onOpenTable={(connection, table) => {
				recordSettingsUsage({ tab: "database", action: "selected", target: "query-tab-open-table" });
				void query.actions.openTable(connection, table);
			}}
			onAnalyzeTable={analyzeTable}
		/>
	);

	const detailsBody: ReactNode = selected ? (
		<DatabaseConnectionDetailsWorkbench model={model} selected={selected} />
	) : null;

	const selectedStatus = selected ? (model.testSnapshots[selected.name]?.status ?? "untested") : "untested";

	const contentPadding = compact ? "px-4 pb-4 pt-3" : mode === "medium" ? "px-6 pb-5 pt-4" : "px-8 pb-6 pt-5";
	const contentGap = compact ? "gap-3" : mode === "medium" ? "gap-4" : "gap-5";
	const mainGap = compact ? "gap-3" : "gap-4";

	// 树/详情 toggle 按钮（仅在该栏 auto 隐藏时出现，点击以覆盖抽屉打开）
	const toggleButtonClass = (active: boolean) => cn(active && "bg-background text-foreground shadow-sm");

	return (
		<div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-background">
			<DatabaseWorkspaceHeader
				variant="toolbar"
				context={
					selected ? (
						<>
							{!compact ? <DatabaseTypeBadge type={selected.type} size="sm" /> : null}
							<span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-foreground">{selected.name}</span>
							<DatabaseStatusPill status={selectedStatus} label={t(`databaseStatus.${selectedStatus}`)} />
						</>
					) : (
						<span className="truncate text-[12px] text-muted-foreground">{t("databaseNoConnectionSelected")}</span>
					)
				}
				actions={
					<>
						{!compact ? (
							<SettingsAiAssist
								tabId="databaseWorkbench"
								triggerLabel={t("databaseAskData.label")}
								buildExtraInstruction={askExtraInstruction}
								className="px-1.5"
							/>
						) : null}
						{!layout.autoTree ? (
							<Button
								variant="ghost"
								size="sm"
								aria-pressed={showTree}
								aria-label={t("databaseConnections")}
								title={t("databaseConnections")}
								className={cn("px-2", toggleButtonClass(showTree))}
								onClick={toggleTree}
							>
								<span className="icon-[mdi--file-tree] h-4 w-4" />
							</Button>
						) : null}
						<Button
							variant="ghost"
							size="sm"
							aria-pressed={showDetails}
							aria-label={t("databaseToggleDetails")}
							title={t("databaseToggleDetails")}
							className={cn("px-2", toggleButtonClass(showDetails))}
							onClick={toggleDetails}
						>
							<span className="icon-[mdi--information-outline] h-4 w-4" />
						</Button>
						<Button
							variant="ghost"
							size="sm"
							className="px-2"
							aria-label={t("databaseRefresh")}
							title={t("databaseRefresh")}
							onClick={() => void model.actions.refresh()}
						>
							<span className="icon-[mdi--refresh] h-4 w-4" />
						</Button>
						<Button
							variant="primary"
							size="sm"
							className="px-2"
							aria-label={t("databaseAddConnection")}
							title={t("databaseAddConnection")}
							onClick={model.actions.openAdd}
						>
							<span className="icon-[mdi--plus] h-4 w-4" />
						</Button>
					</>
				}
			/>

			<div className={cn("flex min-h-0 flex-1", contentPadding, contentGap)}>
				{showTree && !treeAsOverlay ? (
					<aside
						style={{ width: treeWidth }}
						className="relative flex shrink-0 flex-col overflow-hidden rounded-xl bg-muted/40"
					>
						<DatabaseListHeader label={t("databaseConnections")} count={model.connections.length} />
						<div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">{treeBody}</div>
						<ResizeHandle side="right" onResize={onTreeResize} />
					</aside>
				) : null}

				<main className={cn("flex min-w-0 flex-1 flex-col", mainGap)}>
					{selected ? (
						<>
							{/* V5-③ 多查询标签条：切换 / 关闭（hover 减号）/ 拖拽排序 / 溢出收纳 + 「+」新建。 */}
							<div className="flex min-w-0 items-end gap-1">
								<TabBar
									className="min-w-0 flex-1"
									items={query.tabs.map((tab) => ({ key: tab.id, label: tab.title, removable: true }))}
									value={query.activeTabId}
									onChange={handleTabChange}
									onRemove={handleTabClose}
									onReorder={handleTabReorder}
									onOverflowChange={setOverflowTabIds}
								/>
								<Button
									variant="ghost"
									size="sm"
									className="mb-0.5 h-6 shrink-0 px-2"
									aria-label={t("databaseNewQuery")}
									title={t("databaseNewQuery")}
									onClick={handleNewTab}
								>
									<span className="icon-[mdi--plus] h-3.5 w-3.5" />
								</Button>
								{overflowTabIds.length > 0 ? (
									<DropdownMenu>
										<DropdownMenuTrigger asChild>
											<Button
													variant="ghost"
													size="sm"
													className="mb-0.5 h-6 shrink-0 gap-1 px-2 text-[11px]"
													aria-label={t("databaseMoreTabs")}
													title={t("databaseMoreTabs")}
												>
													<span className="icon-[mdi--dots-horizontal] h-3.5 w-3.5" />
												</Button>
										</DropdownMenuTrigger>
										<DropdownMenuContent align="end" className="w-48">
											{overflowTabIds.map((id) => {
												const tab = query.tabs.find((item) => item.id === id);
												return tab ? (
													<DropdownMenuItem key={id} onClick={() => handleTabChange(id)}>
														<span className="min-w-0 truncate">{tab.title}</span>
													</DropdownMenuItem>
												) : null;
											})}
										</DropdownMenuContent>
									</DropdownMenu>
								) : null}
							</div>
							<DatabaseQueryPanel
								connection={selected}
								sql={query.sql}
								busy={query.status === "running"}
								history={query.history}
								onChange={query.actions.setSql}
								onRun={() => void query.actions.run(selected)}
								onClearHistory={query.actions.clearHistory}
							/>
							<DatabaseResultGrid
								status={query.status}
								result={query.result}
								connectionName={query.resultConnectionName}
								error={query.error}
								errorDetail={query.errorDetail}
								canLoadMore={query.canLoadMore}
								loadedLimit={query.loadedLimit}
								loadingMore={query.loadingMore}
								onLoadMore={() => {
									recordSettingsUsage({ tab: "database", action: "selected", target: "result-load-more" });
									void query.actions.loadMore(selected);
								}}
								// B3.2-R 数据编辑（讨论定案）：添加行（INSERT）始终可用（无需主键定位）；
								// 单元格编辑/删行需主键（pkColumns.length > 0），无主键时禁用并由 editDisabledReason 说明；
								// describeTable 失败也需暴露原因（pkState=failed）；按钮常显，自由 SQL 不可编辑查询显示只读徽章。
								editable={editTarget !== null && query.status === "success" && pkState === "ready" && pkColumns.length > 0}
								canAddRow={editTarget !== null && query.status === "success"}
								editDisabledReason={
									query.status !== "success"
										? t("databaseEditDisabledQueryFailed")
										: pkState === "failed"
											? t("databaseEditDisabledDescribeFailed")
											: !editTarget && !editability.editable
												? t(`databaseEditReadOnlyReason.${editability.reason}`)
												: editTarget && pkState === "ready" && pkColumns.length === 0
													? t("databaseEditDisabledNoPk")
													: null
								}
								readOnlyReason={
									!query.openTableMeta && query.status === "success" && query.result && !editability.editable
										? editability.reason
										: null
								}
								showKeylessWarning={
									editTarget !== null && query.status === "success" && pkState === "ready" && pkColumns.length > 0 && !pkColumns.some((pk) => lastResultColumns.includes(pk))
								}
								onRefresh={() => {
									recordSettingsUsage({ tab: "database", action: "selected", target: "result-refresh" });
									if (query.openTableMeta) void query.actions.reloadOpenTable(selected);
									else if (query.resultSql) void query.actions.rerun(selected, query.resultSql);
								}}
								tableName={query.openTableMeta?.table ?? null}
								writeError={writeError}
								onDismissWriteError={() => setWriteError(null)}
								onSaveCell={handleSaveCell}
								onAddRow={handleAddRow}
								onDeleteRow={handleDeleteRow}
								onAnalyzeResult={
									// B3.3 失败解读：SQL 存在且（有结果或有错误）时均可让 AI 分析（成功解读 / 解释错误）。
									lastResultSql && (lastResult || query.error)
										? () =>
												analyzeResult({
													connection: selected,
													sql: lastResultSql,
													result: lastResult,
													error: query.error,
													errorDetail: query.errorDetail,
												})
										: undefined
								}
							/>
						</>
					) : (
						<motion.div
							initial={{ opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.4, ease: EASE_OUT }}
							className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center"
						>
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
						</motion.div>
					)}
				</main>

				{showDetails && !detailsAsOverlay && selected ? (
					<aside className="w-[320px] shrink-0 overflow-y-auto rounded-xl bg-muted/40 px-4 py-4">{detailsBody}</aside>
				) : null}
			</div>

			{treeAsOverlay || detailsAsOverlay ? (
				<div className="absolute inset-0 z-30">
					<div className="absolute inset-0 bg-black/25" onClick={closeOverlays} />
					{treeAsOverlay ? (
						<aside className="absolute bottom-0 left-0 top-0 z-10 flex w-[min(300px,calc(100%-40px))] flex-col overflow-hidden rounded-r-xl bg-muted/95 shadow-2xl">
							<DatabaseListHeader
								label={t("databaseConnections")}
								count={model.connections.length}
								action={
									<Button
										variant="ghost"
										size="xs"
										aria-label={t("databaseCollapse")}
										title={t("databaseCollapse")}
										onClick={() => setTreeOverride(false)}
									>
										<span className="icon-[mdi--close] h-4 w-4" />
									</Button>
								}
							/>
							<div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">{treeBody}</div>
						</aside>
					) : null}
					{detailsAsOverlay && selected ? (
						<aside className="absolute bottom-0 right-0 top-0 z-10 w-[min(340px,calc(100%-40px))] overflow-y-auto rounded-l-xl bg-muted/95 px-4 py-4 shadow-2xl">
							<div className="mb-3 flex items-center justify-between">
								<DatabaseSectionLabel icon="icon-[mdi--information-outline]">{t("databaseToggleDetails")}</DatabaseSectionLabel>
								<Button
									variant="ghost"
									size="xs"
									aria-label={t("databaseCollapse")}
									title={t("databaseCollapse")}
									onClick={() => setDetailsOverride(false)}
								>
									<span className="icon-[mdi--close] h-4 w-4" />
								</Button>
							</div>
							{detailsBody}
						</aside>
					) : null}
				</div>
			) : null}

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
