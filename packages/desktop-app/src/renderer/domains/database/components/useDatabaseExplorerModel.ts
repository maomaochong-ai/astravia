import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DbColumnInfo, DbTableInfo } from "../../../../preload/api-types/database";
import { describeTable, listTables } from "../lib/database-api";
import { formatDatabaseError } from "../lib/database-error-labels";

/** 懒加载列表节点（表 / 列共用）：loaded 标记是否已取数，error 为可展示文案。 */
export interface ExplorerListNode<T> {
	readonly loaded: boolean;
	readonly loading: boolean;
	readonly error: string | null;
	readonly items: readonly T[];
}

const EMPTY_NODE = { loaded: false, loading: false, error: null, items: [] as const } as const;

export interface DatabaseExplorerModel {
	readonly tablesOf: (connection: string) => ExplorerListNode<DbTableInfo>;
	readonly columnsOf: (connection: string, table: string) => ExplorerListNode<DbColumnInfo>;
	readonly isConnectionExpanded: (connection: string) => boolean;
	readonly isTableExpanded: (connection: string, table: string) => boolean;
	/** V2-③ 分组折叠：分组名 → 是否折叠（折叠时隐藏组内连接）。 */
	readonly isGroupCollapsed: (group: string) => boolean;
	readonly actions: {
		readonly toggleConnection: (connection: string) => void;
		readonly toggleTable: (connection: string, table: string) => void;
		readonly reloadTables: (connection: string) => void;
		readonly reloadColumns: (connection: string, table: string) => void;
		readonly toggleGroup: (group: string) => void;
	};
}

function tableKey(connection: string, table: string): string {
	return `${connection}::${table}`;
}

/** 连接 → 表 → 列 的懒加载树状态（B2.6 + V2 分组折叠）。展开才取数，失败可重试。 */
export function useDatabaseExplorerModel(): DatabaseExplorerModel {
	const { t } = useTranslation("settings");

	const [expandedConnections, setExpandedConnections] = useState<Readonly<Record<string, true>>>({});
	const [expandedTables, setExpandedTables] = useState<Readonly<Record<string, true>>>({});
	const [collapsedGroups, setCollapsedGroups] = useState<Readonly<Record<string, true>>>({});
	const [tables, setTables] = useState<Readonly<Record<string, ExplorerListNode<DbTableInfo>>>>({});
	const [columns, setColumns] = useState<Readonly<Record<string, ExplorerListNode<DbColumnInfo>>>>({});

	const loadTables = useCallback(
		async (connection: string) => {
			setTables((prev) => ({
				...prev,
				[connection]: { ...(prev[connection] ?? EMPTY_NODE), loading: true, error: null },
			}));
			try {
				const items = await listTables(connection);
				setTables((prev) => ({ ...prev, [connection]: { loaded: true, loading: false, error: null, items } }));
			} catch (caught) {
				const { message } = formatDatabaseError(t, caught);
				setTables((prev) => ({
					...prev,
					[connection]: { ...(prev[connection] ?? EMPTY_NODE), loading: false, error: message },
				}));
			}
		},
		[t],
	);

	const loadColumns = useCallback(
		async (connection: string, table: string) => {
			const key = tableKey(connection, table);
			setColumns((prev) => ({ ...prev, [key]: { ...(prev[key] ?? EMPTY_NODE), loading: true, error: null } }));
			try {
				const items = await describeTable(connection, table);
				setColumns((prev) => ({ ...prev, [key]: { loaded: true, loading: false, error: null, items } }));
			} catch (caught) {
				const { message } = formatDatabaseError(t, caught);
				setColumns((prev) => ({
					...prev,
					[key]: { ...(prev[key] ?? EMPTY_NODE), loading: false, error: message },
				}));
			}
		},
		[t],
	);

	const toggleConnection = useCallback(
		(connection: string) => {
			const expanded = expandedConnections[connection] === true;
			if (expanded) {
				setExpandedConnections((prev) => {
					const next = { ...prev };
					delete next[connection];
					return next;
				});
				return;
			}
			const node = tables[connection];
			if (!(node?.loaded || node?.loading)) void loadTables(connection);
			setExpandedConnections((prev) => ({ ...prev, [connection]: true }));
		},
		[expandedConnections, loadTables, tables],
	);

	const toggleTable = useCallback(
		(connection: string, table: string) => {
			const key = tableKey(connection, table);
			const expanded = expandedTables[key] === true;
			if (expanded) {
				setExpandedTables((prev) => {
					const next = { ...prev };
					delete next[key];
					return next;
				});
				return;
			}
			const node = columns[key];
			if (!(node?.loaded || node?.loading)) void loadColumns(connection, table);
			setExpandedTables((prev) => ({ ...prev, [key]: true }));
		},
		[columns, expandedTables, loadColumns],
	);

	const reloadTables = useCallback((connection: string) => void loadTables(connection), [loadTables]);

	const reloadColumns = useCallback(
		(connection: string, table: string) => void loadColumns(connection, table),
		[loadColumns],
	);

	// V2-③ 分组折叠：折叠/展开互斥，不与其他展开状态联动。
	const toggleGroup = useCallback((group: string) => {
		setCollapsedGroups((prev) => {
			if (prev[group] === true) {
				const next = { ...prev };
				delete next[group];
				return next;
			}
			return { ...prev, [group]: true };
		});
	}, []);

	return {
		tablesOf: (connection) => tables[connection] ?? EMPTY_NODE,
		columnsOf: (connection, table) => columns[tableKey(connection, table)] ?? EMPTY_NODE,
		isConnectionExpanded: (connection) => expandedConnections[connection] === true,
		isTableExpanded: (connection, table) => expandedTables[tableKey(connection, table)] === true,
		isGroupCollapsed: (group) => collapsedGroups[group] === true,
		actions: { toggleConnection, toggleTable, reloadTables, reloadColumns, toggleGroup },
	};
}
