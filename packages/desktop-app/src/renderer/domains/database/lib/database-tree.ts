import type { DbConnection, DbTableInfo } from "../../../../preload/api-types/database";

/**
 * V2 连接树升级（对齐 dbx-main ConnectionTree 核心子集）的纯函数：
 * 分组（按 groupPath 首段）、搜索过滤（连接名 / 已加载表名）、表名命中强制展开。
 * 全部无副作用，便于单测。
 */

/** 分组路径分隔符（dbx 引擎 groupPath 常见形式：`组名`、`组/子组`、`组\子组`）。 */
const GROUP_SEPARATOR = /[/\\]/;

/** 取连接所属分组名：groupPath 首段，空则归「默认分组」（文案由调用方提供）。 */
export function connectionGroupOf(connection: DbConnection, defaultLabel: string): string {
	const path = connection.groupPath?.trim();
	if (!path) return defaultLabel;
	const first = path.split(GROUP_SEPARATOR)[0]?.trim();
	return first || defaultLabel;
}

/** 分组结果：保持连接原始顺序，组按组名 localeCompare 排序（默认分组置顶）。 */
export interface ConnectionGroup {
	readonly group: string;
	readonly connections: readonly DbConnection[];
}

export function groupConnections(connections: readonly DbConnection[], defaultLabel: string): ConnectionGroup[] {
	const map = new Map<string, DbConnection[]>();
	for (const connection of connections) {
		const group = connectionGroupOf(connection, defaultLabel);
		const list = map.get(group);
		if (list) list.push(connection);
		else map.set(group, [connection]);
	}
	return [...map.entries()]
		.sort(([a], [b]) => {
			if (a === defaultLabel) return -1;
			if (b === defaultLabel) return 1;
			return a.localeCompare(b);
		})
		.map(([group, list]) => ({ group, connections: list }));
}

/** 连接名是否匹配（不区分大小写）。 */
export function connectionMatchesQuery(connection: DbConnection, normalized: string): boolean {
	return connection.name.toLowerCase().includes(normalized);
}

/** 表名是否匹配（不区分大小写）。 */
export function tableMatchesQuery(table: DbTableInfo, normalized: string): boolean {
	return table.name.toLowerCase().includes(normalized);
}

/**
 * 搜索时过滤表行（V6-① 修复）：返回表名命中的表；空查询返回全部。
 * 表名搜索只保留连接还不够 —— 连接下的表行不过滤会让人以为搜索没生效。
 */
export function filterTables(tables: readonly DbTableInfo[], query: string): DbTableInfo[] {
	const normalized = query.trim().toLowerCase();
	if (!normalized) return [...tables];
	return tables.filter((table) => tableMatchesQuery(table, normalized));
}

/** 搜索过滤结果：可见连接 + 因表名命中而需强制展开的连接名。 */
export interface ConnectionFilterResult {
	readonly visible: readonly DbConnection[];
	/** 表名命中（连接名未命中）时需强制展开的连接名集合。 */
	readonly forceExpanded: Readonly<Set<string>>;
}

/**
 * 按连接名 / 已加载表名过滤。
 * @param tableNamesOf 每连接已加载的表名列表（未加载返回空数组）。
 */
export function filterConnections(
	connections: readonly DbConnection[],
	query: string,
	tableNamesOf: (connection: DbConnection) => readonly DbTableInfo[],
): ConnectionFilterResult {
	const normalized = query.trim().toLowerCase();
	if (!normalized) return { visible: connections, forceExpanded: new Set() };

	const visible: DbConnection[] = [];
	const forceExpanded = new Set<string>();
	for (const connection of connections) {
		if (connectionMatchesQuery(connection, normalized)) {
			visible.push(connection);
			continue;
		}
		// 连接名未命中：若已加载的表中有命中，保留该连接并强制展开（让表行可见）。
		const tables = tableNamesOf(connection);
		if (tables.some((table) => tableMatchesQuery(table, normalized))) {
			visible.push(connection);
			forceExpanded.add(connection.name);
		}
	}
	return { visible, forceExpanded };
}
