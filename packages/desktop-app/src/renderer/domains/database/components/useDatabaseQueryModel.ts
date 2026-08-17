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
	patchQueryTab,
	type QueryTabState,
	reorderQueryTabs,
} from "../lib/query-tabs";
import { buildOpenTableSql } from "../lib/sql-dialect";

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
	/** V4-② 是否可「加载更多」：结果来自「打开表」浏览（SQL 可控，可安全加大 limit 重取）。 */
	readonly canLoadMore: boolean;
	/** V4-② 当前已加载行数上限（打开表浏览时为 100/200/…；自由 SQL 为 null）。 */
	readonly loadedLimit: number | null;
	/** V4-② 加载更多进行中（保持现有结果显示，底部按钮转 loading）。 */
	readonly loadingMore: boolean;
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
		/** V4-② 加载更多：对「打开表」结果用更大的 limit 重取（100 → 200 → 300 …）。 */
		readonly loadMore: (connection: DbConnection) => Promise<void>;
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
		async (connection: DbConnection, sqlText: string, tabId: string) => {
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
				recordHistory(connection.name, sqlText);
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
					openTableMeta: { type: connection.type, table, limit: 100 },
				}),
			]);
			setActiveTabId(id);
			await runSql(connection, sqlText, id);
		},
		[runSql],
	);

	// V4-② 加载更多：保持现有结果显示，用更大 limit 的打开表 SQL 重取并替换结果（作用于激活标签）。
	// V6-① 修复：limit 只在**成功后**推进 —— 加载中/失败时 loadedLimit 保持旧值，
	// 避免底部「已加载前 N 行」与实际行数不一致；成功后再由结果网格跳转到新数据页。
	const loadMore = useCallback(
		async (connection: DbConnection) => {
			const tab = activeTab;
			if (!tab?.openTableMeta || tab.loadingMore) return;
			const meta = tab.openTableMeta;
			const nextLimit = meta.limit + 100;
			const sqlText = buildOpenTableSql(meta.type, meta.table, nextLimit);
			const tabId = tab.id;
			setTabs((prev) =>
				patchQueryTab(prev, tabId, {
					sql: sqlText,
					loadingMore: true,
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
						openTableMeta: { ...meta, limit: nextLimit },
					}),
				);
				recordHistory(connection.name, sqlText);
			} catch (caught) {
				const { message, detail } = formatDatabaseError(t, caught);
				setTabs((prev) => patchQueryTab(prev, tabId, { error: message, errorDetail: detail, status: "error" }));
			} finally {
				setTabs((prev) => patchQueryTab(prev, tabId, { loadingMore: false }));
			}
		},
		[activeTab, recordHistory, t],
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
		canLoadMore: activeTab.openTableMeta !== null && activeTab.status === "success",
		loadedLimit: activeTab.openTableMeta?.limit ?? null,
		loadingMore: activeTab.loadingMore,
		actions: {
			addTab,
			closeTab,
			activateTab,
			reorderTabs,
			setSql,
			run,
			openTable,
			loadMore,
			applyResult,
			clearHistory,
		},
	};
}
