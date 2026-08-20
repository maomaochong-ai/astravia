import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DbConnection, DbQueryResult } from "../../../../preload/api-types/database";
import { executeQuery } from "../lib/database-api";
import { formatDatabaseError } from "../lib/database-error-labels";
import {
	clearQueryHistory,
	loadQueryHistory,
	pushQueryHistory,
	type QueryHistoryEntry,
	saveQueryHistory,
} from "../lib/query-history";
import {
	closeQueryTab,
	createQueryTab,
	type DatabaseQueryStatus,
	type OpenTableMeta,
	patchQueryTab,
	type QueryTabState,
	reorderQueryTabs,
} from "../lib/query-tabs";
import { buildOpenTableSql } from "../lib/sql-dialect";

/** V6-② 打开表浏览每页行数：dbx-mcp `dbx_execute_query` 最多返回 100 行，页大小取上限。 */
export const OPEN_TABLE_PAGE_SIZE = 100;

export type { DatabaseQueryStatus } from "../lib/query-tabs";

export interface DatabaseQueryModel {
	/** V5 多查询标签：每个标签独立 sql/status/result/error/openTableMeta/loadingMore + 标题。 */
	readonly tabs: readonly QueryTabState[];
	readonly activeTabId: string;
	/** 以下为激活标签的投影（兼容既有调用方，查询面板/结果网格直接消费）。 */
	readonly sql: string;
	readonly status: DatabaseQueryStatus;
	readonly result: DbQueryResult | null;
	readonly resultConnectionName: string | null;
	readonly resultSql: string | null;
	readonly error: string | null;
	readonly errorDetail: string | null;
	/** V3-③ 查询历史（最近 N 条，localStorage 持久化，成功执行才记录，全局共享）。 */
	readonly history: readonly QueryHistoryEntry[];
	/** V6-② 是否可「下一页」：结果来自「打开表」浏览且当前页已满（满页假设还有更多，对齐 dbx-main canGoNextDataGridPage）。 */
	readonly canGoNextPage: boolean;
	/** V6-② 服务端分页当前页（1-based；自由 SQL / AI 回填为 null）。 */
	readonly page: number | null;
	/** V6-② 服务端分页每页行数（打开表浏览恒 ≤ 100，受 dbx-mcp `dbx_execute_query` 上限约束）。 */
	readonly pageSize: number | null;
	/** V6-② 当前打开表浏览元信息（B3.2 数据编辑据此定位表/方言）。 */
	readonly openTableMeta: OpenTableMeta | null;
	/** V6-② 服务端翻页进行中（保持现有结果显示，分页按钮转 loading）。 */
	readonly loadingPage: boolean;
	readonly actions: {
		/** V5-③ 「+」新建空白标签（标题「查询 N」）并激活。 */
		readonly addTab: () => void;
		readonly closeTab: (id: string) => void;
		readonly activateTab: (id: string) => void;
		/** 拖拽排序：按新顺序重排标签。 */
		readonly reorderTabs: (ids: string[]) => void;
		/** 写入激活标签的 SQL 文本（用户输入 / V3-③ 历史重放回填）。 */
		readonly setSql: (sql: string) => void;
		/** B2.9-W1/B2.10-W3：AI 对话回填 —— 覆盖激活标签的 SQL + 结果/错误（不触发执行）。 */
		readonly applyResult: (
			connectionName: string,
			sqlText: string,
			result: DbQueryResult | null,
			error?: string | null,
			errorDetail?: string | null,
		) => void;
		/** 执行激活标签的 SQL（结果落在激活标签）。 */
		readonly run: (connection: DbConnection) => Promise<void>;
		/** V5-④ 双击打开表：新建标签并激活，自动生成方言 SQL 并执行。 */
		readonly openTable: (connection: DbConnection, table: string) => Promise<void>;
		/** V6-② 服务端分页翻页：对「打开表」结果按 `LIMIT pageSize OFFSET (page-1)*pageSize` 重查（自由 SQL 无此能力）。 */
		readonly goToPage: (connection: DbConnection, page: number) => Promise<void>;
		/** B3.2 数据编辑后刷新：用当前打开表元信息（type/table/limit）重取结果，不动标签与历史。 */
		readonly reloadOpenTable: (connection: DbConnection) => Promise<void>;
		/** B3.2-R 自由 SQL 结果写后刷新：重跑指定 SQL（不推历史）。 */
		readonly rerun: (connection: DbConnection, sqlText: string) => Promise<void>;
		/** V3-③ 清空查询历史（localStorage 一并清除）。 */
		readonly clearHistory: () => void;
	};
}

/** 查询面板状态（B2.6 + V3 + V5 多查询标签）：SQL 文本、执行状态、结果 / 错误、查询历史；「打开表」生成方言 SQL 并直接执行。 */
export function useDatabaseQueryModel(): DatabaseQueryModel {
	const { t } = useTranslation("settings");

	// V5-② 单实例 → tab 数组：初始一个空白标签（标题「查询 1」），后续 + / 打开表 追加。
	const [tabs, setTabs] = useState<QueryTabState[]>(() => [
		createQueryTab("query-1", t("databaseQueryTab", { count: 1 })),
	]);
	const [activeTabId, setActiveTabId] = useState<string>("query-1");
	const nextTabIdRef = useRef(2);
	const nextTabNumberRef = useRef(2);
	const [history, setHistory] = useState<readonly QueryHistoryEntry[]>(() => loadQueryHistory());

	const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];

	const recordHistory = useCallback((connectionName: string, sqlText: string) => {
		setHistory((prev) => {
			const next = pushQueryHistory(prev, connectionName, sqlText);
			if (next !== prev) saveQueryHistory(next);
			return next;
		});
	}, []);

	const runSql = useCallback(
		async (connection: DbConnection, sqlText: string, tabId: string, record = true) => {
			setTabs((prev) => patchQueryTab(prev, tabId, { status: "running", error: null, errorDetail: null }));
			try {
				const data = await executeQuery(connection.name, sqlText);
				setTabs((prev) =>
					patchQueryTab(prev, tabId, {
						result: data,
						resultConnectionName: connection.name,
						resultSql: sqlText,
						status: "success",
					}),
				);
				if (record) recordHistory(connection.name, sqlText);
			} catch (caught) {
				const { message, detail } = formatDatabaseError(t, caught);
				setTabs((prev) =>
					patchQueryTab(prev, tabId, {
						result: null,
						resultConnectionName: connection.name,
						resultSql: sqlText,
						error: message,
						errorDetail: detail,
						status: "error",
					}),
				);
			}
		},
		[t, recordHistory],
	);

	const addTab = useCallback(() => {
		const id = `query-${nextTabIdRef.current++}`;
		const title = t("databaseQueryTab", { count: nextTabNumberRef.current++ });
		setTabs((prev) => [...prev, createQueryTab(id, title)]);
		setActiveTabId(id);
	}, [t]);

	const closeTab = useCallback(
		(id: string) => {
			// 保持至少一个标签：最后一个被关闭时替换为空白标签。
			const next = closeQueryTab(tabs, id, {
				id: `query-${nextTabIdRef.current++}`,
				title: t("databaseQueryTab", { count: nextTabNumberRef.current++ }),
			});
			setTabs(next);
			if (activeTabId === id) {
				const index = tabs.findIndex((tab) => tab.id === id);
				const fallback = next[Math.min(index, next.length - 1)] ?? next[0];
				setActiveTabId(fallback.id);
			}
		},
		[tabs, activeTabId, t],
	);

	const activateTab = useCallback((id: string) => {
		setActiveTabId(id);
	}, []);

	const reorderTabs = useCallback((ids: string[]) => {
		setTabs((prev) => reorderQueryTabs(prev, ids));
	}, []);

	const setSql = useCallback(
		(sql: string) => {
			setTabs((prev) => patchQueryTab(prev, activeTabId, { sql }));
		},
		[activeTabId],
	);

	const run = useCallback(
		async (connection: DbConnection) => {
			const text = activeTab.sql.trim();
			if (!text) return;
			setTabs((prev) => patchQueryTab(prev, activeTabId, { openTableMeta: null })); // 用户自由 SQL 结果不提供加载更多
			await runSql(connection, text, activeTabId);
		},
		[activeTab.sql, activeTabId, runSql],
	);

	// B3.2-R 写操作后刷新：自由 SQL 结果重跑当前 SQL（不推历史，避免刷新污染查询历史）。
	const rerun = useCallback(
		async (connection: DbConnection, sqlText: string) => {
			await runSql(connection, sqlText, activeTabId, false);
		},
		[activeTabId, runSql],
	);

	const applyResult = useCallback(
		(
			connectionName: string,
			sqlText: string,
			result: DbQueryResult | null,
			error: string | null = null,
			errorDetail: string | null = null,
		) => {
			setTabs((prev) =>
				patchQueryTab(prev, activeTabId, {
					sql: sqlText,
					status: result ? "success" : error ? "error" : "idle",
					result,
					resultConnectionName: connectionName,
					resultSql: sqlText,
					error,
					errorDetail,
					openTableMeta: null, // AI 回填结果不提供加载更多
				}),
			);
		},
		[activeTabId],
	);

	const openTable = useCallback(
		async (connection: DbConnection, table: string) => {
			// V5-④ 双击打开表 → 新建 tab 并激活（标题 = 表名）。
			const id = `query-${nextTabIdRef.current++}`;
			const sqlText = buildOpenTableSql(connection.type, table);
			setTabs((prev) => [
				...prev,
				createQueryTab(id, table, {
					sql: sqlText,
					openTableMeta: { type: connection.type, table, pageSize: OPEN_TABLE_PAGE_SIZE, page: 1 },
				}),
			]);
			setActiveTabId(id);
			await runSql(connection, sqlText, id);
		},
		[runSql],
	);

	// V6-② 服务端分页翻页：保持现有结果显示，按目标页 OFFSET 重查并替换结果（作用于激活标签）。
	// 背景：dbx-mcp `dbx_execute_query` 最多返回 100 行（工具写死 limit=100），
	// 旧的「加载更多」加大 LIMIT 重取永远拿不到第 101 行之后 —— 改为每页固定 pageSize（≤100）行，
	// 翻页用 `LIMIT pageSize OFFSET (page-1)*pageSize`，MCP 截断前 100 行恰好是目标页内容（对齐 dbx-main 服务端分页）。
	const goToPage = useCallback(
		async (connection: DbConnection, page: number) => {
			const tab = activeTab;
			if (!tab?.openTableMeta || tab.loadingPage) return;
			const meta = tab.openTableMeta;
			const target = Math.max(1, page);
			const sqlText = buildOpenTableSql(meta.type, meta.table, meta.pageSize, (target - 1) * meta.pageSize);
			const tabId = tab.id;
			setTabs((prev) =>
				patchQueryTab(prev, tabId, {
					sql: sqlText,
					loadingPage: true,
				}),
			);
			try {
				const data = await executeQuery(connection.name, sqlText);
				setTabs((prev) =>
					patchQueryTab(prev, tabId, {
						result: data,
						resultConnectionName: connection.name,
						resultSql: sqlText,
						status: "success",
						error: null,
						errorDetail: null,
						openTableMeta: { ...meta, page: target },
					}),
				);
				recordHistory(connection.name, sqlText);
			} catch (caught) {
				const { message, detail } = formatDatabaseError(t, caught);
				setTabs((prev) => patchQueryTab(prev, tabId, { error: message, errorDetail: detail, status: "error" }));
			} finally {
				setTabs((prev) => patchQueryTab(prev, tabId, { loadingPage: false }));
			}
		},
		[activeTab, recordHistory, t],
	);

	// B3.2 数据编辑后刷新：写操作成功后按当前 openTableMeta 重取（保持 page/pageSize 与标签不变，不记历史）。
	const reloadOpenTable = useCallback(
		async (connection: DbConnection) => {
			const tab = activeTab;
			if (!tab?.openTableMeta) return;
			const meta = tab.openTableMeta;
			await runSql(
				connection,
				buildOpenTableSql(meta.type, meta.table, meta.pageSize, (meta.page - 1) * meta.pageSize),
				tab.id,
			);
		},
		[activeTab, runSql],
	);

	const clearHistory = useCallback(() => {
		setHistory([]);
		clearQueryHistory();
	}, []);

	return {
		tabs,
		activeTabId,
		sql: activeTab.sql,
		status: activeTab.status,
		result: activeTab.result,
		resultConnectionName: activeTab.resultConnectionName,
		resultSql: activeTab.resultSql,
		error: activeTab.error,
		errorDetail: activeTab.errorDetail,
		history,
		canGoNextPage:
			activeTab.openTableMeta !== null &&
			activeTab.status === "success" &&
			(activeTab.result?.rows.length ?? 0) >= activeTab.openTableMeta.pageSize,
		page: activeTab.openTableMeta?.page ?? null,
		pageSize: activeTab.openTableMeta?.pageSize ?? null,
		openTableMeta: activeTab.openTableMeta,
		loadingPage: activeTab.loadingPage,
		actions: {
			addTab,
			closeTab,
			activateTab,
			reorderTabs,
			setSql,
			run,
			openTable,
			goToPage,
			reloadOpenTable,
			rerun,
			applyResult,
			clearHistory,
		},
	};
}
