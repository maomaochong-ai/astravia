import { useEffect, useMemo, useState, type JSX, type MouseEvent as ReactMouseEvent } from "react";
import { Button, cn, Spin } from "@astravia/ui";
import { useTranslation } from "react-i18next";
import type { DbColumnInfo, DbConnection, DbTableInfo } from "../../../../preload/api-types/database";
import { recordSettingsUsage } from "../../settings/components/recordSettingsUsage";
import { connectionMatchesQuery, filterConnections, filterTables, groupConnections } from "../lib/database-tree";
import { DatabaseStatusDot } from "./DatabaseStatus";
import { DatabaseTypeBadge } from "./DatabaseTypeBadge";
import {
	DatabaseExplorerContextMenu,
	type DatabaseContextMenuItem,
} from "./DatabaseExplorerContextMenu";
import type { DatabaseExplorerModel, ExplorerListNode } from "./useDatabaseExplorerModel";
import type { DatabaseConnectionTestStatus } from "./useDatabaseWorkspaceModel";

interface DatabaseExplorerTreeProps {
	connections: readonly DbConnection[];
	selectedName: string | null;
	explorer: DatabaseExplorerModel;
	/** 连接状态（来自测试快照），用于连接行状态点。 */
	statusOf: (name: string) => DatabaseConnectionTestStatus;
	onSelect: (name: string) => void;
	onOpenTable: (connection: DbConnection, table: string) => void;
	onAnalyzeTable: (connection: DbConnection, table: string) => void;
}

const SEARCH_DEBOUNCE_MS = 300;

function NodeErrorRow({ message, onRetry }: { message: string; onRetry: () => void }): JSX.Element {
	const { t } = useTranslation("settings");
	return (
		<div className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5">
			<span className="min-w-0 truncate text-[11.5px] text-destructive">{message}</span>
			<Button variant="ghost" size="xs" onClick={onRetry}>
				<span className="icon-[mdi--refresh] h-3 w-3" />
				{t("databaseRetry")}
			</Button>
		</div>
	);
}

function ColumnRows({ node, onRetry }: { node: ExplorerListNode<DbColumnInfo>; onRetry: () => void }): JSX.Element {
	const { t } = useTranslation("settings");
	if (node.loading) {
		return (
			<div className="flex items-center gap-2 px-2 py-1.5">
				<Spin size="sm" />
			</div>
		);
	}
	if (node.error) return <NodeErrorRow message={node.error} onRetry={onRetry} />;
	return (
		<>
			{node.items.map((column) => (
				<div key={column.name} className="flex items-center gap-1.5 rounded-md px-2 py-1" title={`${column.name} ${column.type}`}>
					<span
						className={cn(
							"h-3 w-3 shrink-0",
							column.isPrimaryKey ? "icon-[mdi--key-outline] text-amber-500/80" : "icon-[mdi--code-braces] text-muted-foreground/50",
						)}
					/>
					<span className="min-w-0 truncate text-[11.5px] text-foreground/80">{column.name}</span>
					<span className="ml-auto shrink-0 text-[10.5px] text-muted-foreground/60">{column.type}</span>
				</div>
			))}
			{node.items.length === 0 ? (
				<div className="px-2 py-1 text-[11.5px] text-muted-foreground/60">{t("databaseNoTables")}</div>
			) : null}
		</>
	);
}

function TableRows({
	connection,
	explorer,
	onOpenTable,
	onAnalyzeTable,
	onContextMenu,
	searchQuery,


}: {
	connection: DbConnection;
	explorer: DatabaseExplorerModel;
	onOpenTable: (connection: DbConnection, table: string) => void;
	onAnalyzeTable: (connection: DbConnection, table: string) => void;
	onContextMenu: (event: ReactMouseEvent, connection: DbConnection, table: DbTableInfo) => void;
	/** V6-①：搜索词（表名命中时只显示命中的表行；连接名命中或空查询显示全部）。 */
	searchQuery: string;

}): JSX.Element {
	const { t } = useTranslation("settings");
	const node = explorer.tablesOf(connection.name);
	if (node.loading) {
		return (
			<div className="flex items-center gap-2 px-2 py-1.5">
				<Spin size="sm" />
			</div>
		);
	}
	if (node.error) {
		return <NodeErrorRow message={node.error} onRetry={() => explorer.actions.reloadTables(connection.name)} />;
	}
	// V6-①：搜索时若连接名未命中（仅表名命中），只显示命中的表行，避免「搜到连接但表全显示」。
	const normalized = searchQuery.trim().toLowerCase();
	const items =
		normalized && !connectionMatchesQuery(connection, normalized)
			? filterTables(node.items, normalized)
			: node.items;
	if (node.loaded && items.length === 0) {
		return <div className="px-2 py-1.5 text-[11.5px] text-muted-foreground/60">{t("databaseNoTables")}</div>;
	}
	return (
		<>
			{items.map((table: DbTableInfo) => {
				const expanded = explorer.isTableExpanded(connection.name, table.name);
				const columns = explorer.columnsOf(connection.name, table.name);
				return (
					<div key={table.name}>
						<div
							className="group flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 hover:bg-background/60"
							onDoubleClick={() => onOpenTable(connection, table.name)}
							onContextMenu={(event) => onContextMenu(event, connection, table)}
							title={t("databaseQueryHint")}
						>
							<button
								type="button"
								aria-label={expanded ? t("databaseCollapse") : t("databaseExpand")}
								className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground/70"
								onClick={(event) => {
									event.stopPropagation();
									explorer.actions.toggleTable(connection.name, table.name);
								}}
							>
								<span className={cn("h-3 w-3 transition-transform", expanded && "rotate-90", "icon-[mdi--chevron-right]")} />
							</button>
							<span className="h-3.5 w-3.5 shrink-0 icon-[solar--table-linear] text-muted-foreground/70" />
							<span className="min-w-0 truncate text-[12px] font-medium text-foreground/90">{table.name}</span>
							<div className="ml-auto hidden shrink-0 items-center gap-0.5 group-hover:flex">
								<button
									type="button"
									aria-label={t("databaseAnalyzeTable.label")}
									title={t("databaseAnalyzeTable.label")}
									className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground/70 hover:bg-muted hover:text-foreground"
									onClick={(event) => {
										event.stopPropagation();
										onAnalyzeTable(connection, table.name);
									}}
								>
									<span className="h-3.5 w-3.5 icon-[solar--magic-stick-linear]" />
								</button>
								<button
									type="button"
									aria-label={t("databaseOpenTable")}
									title={t("databaseOpenTable")}
									className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground/70 hover:bg-muted hover:text-foreground"
									onClick={(event) => {
										event.stopPropagation();
										void onOpenTable(connection, table.name);
									}}
								>
									<span className="h-3.5 w-3.5 icon-[mdi--play-box-outline]" />
								</button>
							</div>
						</div>
						{expanded ? (
							<div className="ml-[22px] pl-1.5">
								<ColumnRows
									node={columns}
									onRetry={() => explorer.actions.reloadColumns(connection.name, table.name)}
								/>
							</div>
						) : null}
					</div>
				);
			})}
		</>
	);
}

/**
 * 搜索时自动加载未展开连接的表数据（表名过滤依赖已加载表）。
 *
 * 原实现（V2）只展开 `visible` 快照，而表名过滤只对**已加载**表生效
 * （`filterConnections` 的表名匹配来自 `tablesOf(...).items`，未加载连接返回空）——
 * 未展开过的连接里的表永远搜不到。修复分两步：
 * ① 对所有连接自动触发表数据加载（未加载才加载，加载中不重复）；
 * ② 展开改为纯渲染态（V6-①）：searching 时 visible 连接一律展开，
 *    搜索结束自动恢复，不再用 toggleConnection 永久改写展开状态。
 */
function useAutoExpandOnSearch(
	explorer: DatabaseExplorerModel,
	allConnections: readonly DbConnection[],
	searching: boolean,
) {
	// 表名过滤依赖已加载表：搜索时对未加载连接自动取表，加载完成前不阻塞过滤。
	useEffect(() => {
		if (!searching) return;
		for (const connection of allConnections) {
			const node = explorer.tablesOf(connection.name);
			if (!node.loaded && !node.loading) {
				void explorer.actions.reloadTables(connection.name);
			}
		}
	}, [allConnections, explorer, searching]);
}

/** 连接 → 表 → 列 懒加载树（V2：sticky 搜索 + 状态点 + 右键菜单 + 分组折叠）。 */
export function DatabaseExplorerTree({
	connections,
	selectedName,
	explorer,
	statusOf,
	onSelect,
	onOpenTable,
	onAnalyzeTable,

}: DatabaseExplorerTreeProps): JSX.Element {
	const { t } = useTranslation("settings");

	// V2-① sticky 搜索区：debounce 300ms，过滤连接名 / 已加载表名。
	const [searchInput, setSearchInput] = useState("");
	const [deferredQuery, setDeferredQuery] = useState("");
	useEffect(() => {
		const timer = window.setTimeout(() => setDeferredQuery(searchInput), SEARCH_DEBOUNCE_MS);
		return () => window.clearTimeout(timer);
	}, [searchInput]);

	const { visible } = useMemo(
		() => filterConnections(connections, deferredQuery, (connection) => explorer.tablesOf(connection.name).items),
		[connections, deferredQuery, explorer],
	);
	const searching = deferredQuery.trim().length > 0;
	useAutoExpandOnSearch(explorer, connections, searching);

	// V2-③ 分组：按 groupPath 首段分组，组头可折叠。
	const defaultGroupLabel = t("databaseGroupDefault");
	const groups = useMemo(() => groupConnections(visible, defaultGroupLabel), [visible, defaultGroupLabel]);

	// V2-② 右键菜单：记录触发位置与菜单项，由 DatabaseExplorerContextMenu 渲染。
	const [menu, setMenu] = useState<{ x: number; y: number; items: DatabaseContextMenuItem[] } | null>(null);

	const copyName = (label: string) => {
		void navigator.clipboard.writeText(label).catch(() => {});
		recordSettingsUsage({ tab: "database", action: "selected", target: "explorer-copy-name" });
	};

	const openConnectionMenu = (event: ReactMouseEvent, connection: DbConnection) => {
		event.preventDefault();
		event.stopPropagation();
		const expanded = explorer.isConnectionExpanded(connection.name);
		const items: DatabaseContextMenuItem[] = [
			{
				key: "toggle",
				icon: expanded ? "icon-[mdi--chevron-down]" : "icon-[mdi--chevron-right]",
				label: expanded ? t("databaseCollapse") : t("databaseExpand"),
				onSelect: () => explorer.actions.toggleConnection(connection.name),
			},
			{
				key: "refresh",
				icon: "icon-[mdi--refresh]",
				label: t("databaseRefresh"),
				onSelect: () => {
					explorer.actions.reloadTables(connection.name);
					recordSettingsUsage({ tab: "database", action: "selected", target: "explorer-refresh" });
				},
			},
			{
				key: "copy",
				icon: "icon-[mdi--content-copy]",
				label: t("databaseCopyName"),
				onSelect: () => copyName(connection.name),
			},
		];
		setMenu({ x: event.clientX, y: event.clientY, items });
	};

	const openTableMenu = (event: ReactMouseEvent, connection: DbConnection, table: DbTableInfo) => {
		event.preventDefault();
		event.stopPropagation();
		const expanded = explorer.isTableExpanded(connection.name, table.name);
		const items: DatabaseContextMenuItem[] = [
			{
				key: "open",
				icon: "icon-[mdi--play-box-outline]",
				label: t("databaseOpenTable"),
				onSelect: () => void onOpenTable(connection, table.name),
			},
			{
				key: "analyze",
				icon: "icon-[solar--magic-stick-linear]",
				label: t("databaseAnalyzeTable.label"),
				onSelect: () => onAnalyzeTable(connection, table.name),
			},
			{
				key: "toggle",
				icon: expanded ? "icon-[mdi--chevron-down]" : "icon-[mdi--chevron-right]",
				label: expanded ? t("databaseCollapse") : t("databaseExpand"),
				onSelect: () => explorer.actions.toggleTable(connection.name, table.name),
			},
			{
				key: "refresh",
				icon: "icon-[mdi--refresh]",
				label: t("databaseRefresh"),
				onSelect: () => explorer.actions.reloadColumns(connection.name, table.name),
			},
			{
				key: "copy",
				icon: "icon-[mdi--content-copy]",
				label: t("databaseCopyName"),
				onSelect: () => copyName(table.name),
			},
		];
		setMenu({ x: event.clientX, y: event.clientY, items });
	};

	return (
		<div className="space-y-0.5">
			{/* V2-① sticky 搜索区：跟随列表滚动，悬浮于树内容之上 */}
			<div className="sticky top-0 z-10 -mx-1 bg-muted/95 px-1 pb-1.5 pt-0.5 backdrop-blur-sm">
				<div className="relative">
					<span className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60 icon-[mdi--magnify]" />
					<input
						type="text"
						value={searchInput}
						onChange={(event) => setSearchInput(event.target.value)}
						placeholder={t("databaseSearchConnections")}
						aria-label={t("databaseSearchConnections")}
						className="h-7 w-full rounded-md border border-border/60 bg-background pl-7 pr-6 text-[12px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary/60 focus:ring-1 focus:ring-primary/30"
					/>
					{searchInput ? (
						<button
							type="button"
							aria-label={t("databaseClearSearch")}
							title={t("databaseClearSearch")}
							className="absolute right-1 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground/60 hover:bg-muted hover:text-foreground"
							onClick={() => setSearchInput("")}
						>
							<span className="h-3 w-3 icon-[mdi--close]" />
						</button>
					) : null}
				</div>
			</div>

			{groups.length === 0 && searching ? (
				<div className="px-2 py-4 text-center text-[12px] text-muted-foreground/60">{t("databaseNoSearchResults")}</div>
			) : (
				groups.map(({ group, connections: groupConnections }) => {
					// 搜索时忽略组折叠：组内连接可能命中过滤结果，折叠组隐藏会“搜到却看不到”。
					const collapsed = searching ? false : explorer.isGroupCollapsed(group);
					return (
						<div key={group}>
							<button
								type="button"
								className="flex w-full cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-left hover:bg-background/60"
								onClick={() => explorer.actions.toggleGroup(group)}
								aria-expanded={!collapsed}
							>
								<span className={cn("h-3 w-3 shrink-0 transition-transform text-muted-foreground/60", !collapsed && "rotate-90", "icon-[mdi--chevron-right]")} />
								<span className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
									{group}
								</span>
								<span className="ml-auto shrink-0 text-[10.5px] text-muted-foreground/50">{groupConnections.length}</span>
							</button>
							{!collapsed ? (
								<div className="space-y-0.5 pl-[7px]">
									{groupConnections.map((connection) => {
										const expanded = searching || explorer.isConnectionExpanded(connection.name);
										const selected = connection.name === selectedName;
										return (
											<div key={connection.name}>
												<div
													className={cn(
														"group flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-2",
														selected ? "bg-background shadow-sm" : "hover:bg-background/60",
													)}
													onClick={() => onSelect(connection.name)}
													onContextMenu={(event) => openConnectionMenu(event, connection)}
												>
													<button
														type="button"
														aria-label={expanded ? t("databaseCollapse") : t("databaseExpand")}
														className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground/70"
														onClick={(event) => {
															event.stopPropagation();
															explorer.actions.toggleConnection(connection.name);
														}}
													>
														<span className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-90", "icon-[mdi--chevron-right]")} />
													</button>
													<DatabaseStatusDot status={statusOf(connection.name)} />
													<DatabaseTypeBadge type={connection.type} size="sm" />
													<span className="min-w-0 truncate text-[12.5px] font-semibold text-foreground">{connection.name}</span>
												</div>
												{expanded ? (
													<div className="ml-[13px] pl-1.5">
														<TableRows
															connection={connection}
															explorer={explorer}
															onOpenTable={onOpenTable}
															onAnalyzeTable={onAnalyzeTable}
															onContextMenu={openTableMenu}
															searchQuery={deferredQuery}
														/>
													</div>
												) : null}
											</div>
										);
									})}
								</div>
							) : null}
						</div>
					);
				})
			)}

			{menu ? <DatabaseExplorerContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} /> : null}
		</div>
	);
}
