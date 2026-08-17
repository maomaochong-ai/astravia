import type { DbQueryResult } from "../../../../preload/api-types/database";

/** 查询 tab 的执行状态（V5 多查询标签后随每个 tab 独立）。 */
export type DatabaseQueryStatus = "idle" | "running" | "success" | "error";

/** V4-②「打开表」浏览元信息：结果来自打开表浏览时记录（type + table + 当前 limit），自由 SQL / AI 回填不设。 */
export interface OpenTableMeta {
	readonly type: string;
	readonly table: string;
	readonly limit: number;
}

/**
 * 单个查询标签的完整状态（V5：useDatabaseQueryModel 单实例 → tab 数组）。
 * 标题：打开表 = 表名；新建空标签 = 本地化「查询 N」（由 hook 生成后写入）。
 */
export interface QueryTabState {
	readonly id: string;
	readonly title: string;
	readonly sql: string;
	readonly status: DatabaseQueryStatus;
	readonly result: DbQueryResult | null;
	readonly resultConnectionName: string | null;
	readonly resultSql: string | null;
	readonly error: string | null;
	readonly errorDetail: string | null;
	readonly openTableMeta: OpenTableMeta | null;
	readonly loadingMore: boolean;
}

/** 新建一个空白查询标签；initial 覆盖默认字段（如打开表时预填 sql + openTableMeta）。 */
export function createQueryTab(
	id: string,
	title: string,
	initial: Partial<Omit<QueryTabState, "id" | "title">> = {},
): QueryTabState {
	return {
		id,
		title,
		sql: "",
		status: "idle",
		result: null,
		resultConnectionName: null,
		resultSql: null,
		error: null,
		errorDetail: null,
		openTableMeta: null,
		loadingMore: false,
		...initial,
	};
}

/**
 * 关闭一个标签：保持至少一个标签（最后一个被关闭时替换为 fallback 空白标签）。
 * 返回新数组（不修改入参）；id 不存在时返回原数组的拷贝。
 */
export function closeQueryTab(
	tabs: readonly QueryTabState[],
	id: string,
	fallback: { id: string; title: string },
): QueryTabState[] {
	const index = tabs.findIndex((tab) => tab.id === id);
	if (index === -1) return [...tabs];
	const next = tabs.filter((tab) => tab.id !== id);
	if (next.length > 0) return next;
	return [createQueryTab(fallback.id, fallback.title)];
}

/** 按新顺序重排标签：未知 key 忽略，未出现在 ids 中的标签稳定追加到末尾。 */
export function reorderQueryTabs(tabs: readonly QueryTabState[], ids: readonly string[]): QueryTabState[] {
	const remaining = new Map(tabs.map((tab) => [tab.id, tab]));
	const ordered: QueryTabState[] = [];
	for (const id of ids) {
		const tab = remaining.get(id);
		if (tab) {
			ordered.push(tab);
			remaining.delete(id);
		}
	}
	for (const tab of remaining.values()) ordered.push(tab);
	return ordered;
}

/** 对指定标签打补丁（不可变）：id 不存在时返回原数组的拷贝；其它标签不受影响。 */
export function patchQueryTab(
	tabs: readonly QueryTabState[],
	id: string,
	patch: Partial<Omit<QueryTabState, "id">>,
): QueryTabState[] {
	const index = tabs.findIndex((tab) => tab.id === id);
	if (index === -1) return [...tabs];
	return [...tabs.slice(0, index), { ...tabs[index], ...patch }, ...tabs.slice(index + 1)];
}
