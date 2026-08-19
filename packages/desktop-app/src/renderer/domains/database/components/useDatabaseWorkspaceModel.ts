import { confirmDialogAtom } from "@shared/store/atoms";
import { useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SchemaInjectionScopeData } from "../../../../preload/api-types/config";
import type {
	ConnectionEnv,
	DbAddConnectionParams,
	DbConnection,
	DbConnectionTestResult,
	DbTableInfo,
} from "../../../../preload/api-types/database";
import { recordSettingsUsage } from "../../settings/components/recordSettingsUsage";
import { addConnection, listConnections, listTables, removeConnection, testConnection } from "../lib/database-api";
import { formatDatabaseError as formatError } from "../lib/database-error-labels";
import { getDatabaseTypeMeta } from "./database-type-catalog";

export interface DatabaseConnectionFormState {
	readonly dbType: string;
	readonly name: string;
	readonly host: string;
	readonly port: string;
	readonly database: string;
	readonly username: string;
	readonly password: string;
	readonly ssl: boolean;
	/** W4-② 环境标记（缺省 dev）。 */
	readonly env: ConnectionEnv;
}

export type DatabaseConnectionTestStatus = "untested" | "testing" | "ok" | "failed";

export interface DatabaseConnectionTestSnapshot {
	readonly status: DatabaseConnectionTestStatus;
	readonly detail: string;
	readonly tableCount: number;
}

/** 感知范围类型（B2.10-W4-①）。 */
export type SchemaInjectionScopeKind = SchemaInjectionScopeData["scope"];

/** 感知范围缺省值：all（全部连接全表）。 */
const DEFAULT_SCHEMA_INJECTION_SCOPE: SchemaInjectionScopeData = { scope: "all", connections: [], tables: [] };

export type DatabaseFormFieldKey =
	| "dbType"
	| "name"
	| "host"
	| "port"
	| "database"
	| "username"
	| "password"
	| "ssl"
	| "env";

export interface DatabaseWorkspaceModel {
	readonly addOpen: boolean;
	readonly connections: readonly DbConnection[];
	readonly error: string | null;
	readonly errorDetail: string | null;
	readonly form: DatabaseConnectionFormState;
	readonly formBusy: boolean;
	readonly formError: string | null;
	readonly formErrorDetail: string | null;
	readonly formTestResult: DbConnectionTestResult | null;
	readonly formTesting: boolean;
	readonly loading: boolean;
	readonly schemaInjection: boolean;
	readonly schemaInjectionBusy: boolean;
	readonly schemaInjectionScope: SchemaInjectionScopeData;
	readonly schemaInjectionScopeBusy: boolean;
	/** 表级选择用：按连接名缓存的表清单（懒加载）。 */
	readonly connectionTables: Readonly<Record<string, readonly DbTableInfo[]>>;
	readonly loadingTablesFor: string | null;
	readonly dbxToolEnabled: boolean;
	readonly dbxToolBusy: boolean;
	/** W4-② 生产写授权：连接名 → 已显式授权（生产连接默认禁写）。 */
	readonly prodWriteApproved: Readonly<Record<string, boolean>>;
	readonly prodWriteApprovedBusy: boolean;
	readonly selected: DbConnection | null;
	readonly testSnapshots: Readonly<Record<string, DatabaseConnectionTestSnapshot>>;
	readonly testingName: string | null;
	readonly actions: {
		readonly cancelAdd: () => void;
		readonly changeForm: (field: DatabaseFormFieldKey, value: string | boolean) => void;
		readonly openAdd: () => void;
		readonly pickFile: () => Promise<void>;
		readonly refresh: () => Promise<void>;
		readonly remove: (name: string) => void;
		readonly select: (name: string) => void;
		readonly submitAdd: () => Promise<void>;
		readonly testDraft: () => Promise<void>;
		readonly testSaved: (name: string) => Promise<void>;
		readonly toggleSchemaInjection: () => Promise<void>;
		readonly setSchemaInjectionScopeKind: (scope: SchemaInjectionScopeKind) => void;
		readonly toggleScopeConnection: (name: string) => void;
		readonly toggleScopeTable: (connection: string, table: string) => void;
		readonly loadConnectionTables: (connection: string) => Promise<void>;
		readonly toggleDbxToolAccess: () => Promise<void>;
		/** W4-② 显式授权/撤销生产写操作（授权前弹确认）。 */
		readonly toggleProdWriteApproved: (name: string) => void;
	};
}

function emptyForm(dbType = "postgres"): DatabaseConnectionFormState {
	const meta = getDatabaseTypeMeta(dbType);
	return {
		dbType,
		name: "",
		host: meta.fileBased ? "" : "localhost",
		port: meta.fileBased ? "" : meta.defaultPort,
		database: "",
		username: "",
		password: "",
		ssl: false,
		env: "dev",
	};
}

function toParams(form: DatabaseConnectionFormState, name = form.name.trim()): DbAddConnectionParams {
	const port = Number(form.port);
	return {
		name,
		dbType: form.dbType,
		host: form.host.trim(),
		...(form.port.trim() !== "" && Number.isFinite(port) && port > 0 ? { port } : {}),
		...(form.database.trim() !== "" ? { database: form.database.trim() } : {}),
		...(form.username.trim() !== "" ? { username: form.username.trim() } : {}),
		...(form.password !== "" ? { password: form.password } : {}),
		ssl: form.ssl,
		env: form.env,
	};
}

export function useDatabaseWorkspaceModel(): DatabaseWorkspaceModel {
	const { t } = useTranslation("settings");
	const setConfirm = useSetAtom(confirmDialogAtom);

	const [connections, setConnections] = useState<readonly DbConnection[]>([]);
	const [loading, setLoading] = useState(true);
	const [selectedName, setSelectedName] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [errorDetail, setErrorDetail] = useState<string | null>(null);
	const [addOpen, setAddOpen] = useState(false);
	const [form, setForm] = useState<DatabaseConnectionFormState>(() => emptyForm());
	const [formBusy, setFormBusy] = useState(false);
	const [formTesting, setFormTesting] = useState(false);
	const [formError, setFormError] = useState<string | null>(null);
	const [formErrorDetail, setFormErrorDetail] = useState<string | null>(null);
	const [formTestResult, setFormTestResult] = useState<DbConnectionTestResult | null>(null);
	const [testingName, setTestingName] = useState<string | null>(null);
	const [testSnapshots, setTestSnapshots] = useState<Record<string, DatabaseConnectionTestSnapshot>>({});
	const [schemaInjection, setSchemaInjection] = useState(false);
	const [schemaInjectionBusy, setSchemaInjectionBusy] = useState(false);
	const [schemaInjectionScope, setSchemaInjectionScope] =
		useState<SchemaInjectionScopeData>(DEFAULT_SCHEMA_INJECTION_SCOPE);
	const [schemaInjectionScopeBusy, setSchemaInjectionScopeBusy] = useState(false);
	const [connectionTables, setConnectionTables] = useState<Record<string, DbTableInfo[]>>({});
	const [loadingTablesFor, setLoadingTablesFor] = useState<string | null>(null);
	const [dbxToolEnabled, setDbxToolEnabled] = useState(false);
	const [dbxToolBusy, setDbxToolBusy] = useState(false);
	// W4-② 生产写授权状态（desktop-config database.prodWriteApproved，缺省无授权）。
	const [prodWriteApproved, setProdWriteApproved] = useState<Record<string, boolean>>({});
	const [prodWriteApprovedBusy, setProdWriteApprovedBusy] = useState(false);

	const refresh = useCallback(async () => {
		try {
			const rows = await listConnections();
			setConnections(rows);
			setError(null);
			setErrorDetail(null);
			setSelectedName((prev) => (prev && rows.some((c) => c.name === prev) ? prev : (rows[0]?.name ?? null)));
		} catch (caught) {
			const { message, detail } = formatError(t, caught);
			setError(message);
			setErrorDetail(detail);
		} finally {
			setLoading(false);
		}
	}, [t]);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	useEffect(() => {
		void window.astravia.config.get().then((config) => {
			setSchemaInjection(config.database?.schemaInjection === true);
			setSchemaInjectionScope(config.database?.schemaInjectionScope ?? DEFAULT_SCHEMA_INJECTION_SCOPE);
			setDbxToolEnabled(config.database?.dbxToolEnabled === true);
			setProdWriteApproved(config.database?.prodWriteApproved ?? {});
		});
	}, []);

	const openAdd = useCallback(() => {
		setForm(emptyForm());
		setFormError(null);
		setFormErrorDetail(null);
		setFormTestResult(null);
		setAddOpen(true);
	}, []);

	const cancelAdd = useCallback(() => {
		setAddOpen(false);
		setFormError(null);
		setFormErrorDetail(null);
		setFormTestResult(null);
	}, []);

	const changeForm = useCallback((field: DatabaseFormFieldKey, value: string | boolean) => {
		if (field === "dbType" && typeof value === "string") {
			const meta = getDatabaseTypeMeta(value);
			setForm((prev) => ({
				...prev,
				dbType: value,
				host: meta.fileBased ? "" : "localhost",
				port: meta.fileBased ? "" : meta.defaultPort,
			}));
			return;
		}
		if (field === "env") {
			const env: ConnectionEnv = value === "prod" ? "prod" : "dev";
			setForm((prev) => ({ ...prev, env }));
			return;
		}
		setForm((prev) => ({ ...prev, [field]: value }));
	}, []);

	const pickFile = useCallback(async () => {
		try {
			const files = await window.astravia.dialog.selectFiles();
			if (files[0]) setForm((prev) => ({ ...prev, host: files[0] }));
		} catch {
			// 用户取消或对话框失败时不改表单。
		}
	}, []);

	const validate = useCallback(
		(value: DatabaseConnectionFormState): string | null => {
			if (!value.name.trim()) return t("databaseValidationNameRequired");
			if (!value.host.trim()) return t("databaseValidationHostRequired");
			return null;
		},
		[t],
	);

	const submitAdd = useCallback(async () => {
		const validation = validate(form);
		if (validation) {
			setFormError(validation);
			setFormErrorDetail(null);
			return;
		}
		setFormBusy(true);
		setFormError(null);
		setFormErrorDetail(null);
		try {
			const created = await addConnection(toParams(form));
			recordSettingsUsage({ tab: "database", action: "added", target: "connection" });
			setAddOpen(false);
			await refresh();
			setSelectedName(created.name);
		} catch (caught) {
			const { message, detail } = formatError(t, caught);
			setFormError(message);
			setFormErrorDetail(detail);
		} finally {
			setFormBusy(false);
		}
	}, [form, refresh, t, validate]);

	const testDraft = useCallback(async () => {
		const validation = validate(form);
		if (validation) {
			setFormError(validation);
			setFormErrorDetail(null);
			return;
		}
		setFormTesting(true);
		setFormError(null);
		setFormErrorDetail(null);
		setFormTestResult(null);
		try {
			const result = await testConnection({ draft: toParams(form) });
			setFormTestResult(result);
			recordSettingsUsage({ tab: "database", action: "tested", target: "connection-draft" });
		} catch (caught) {
			const { message, detail } = formatError(t, caught);
			setFormError(message);
			setFormErrorDetail(detail);
		} finally {
			setFormTesting(false);
		}
	}, [form, t, validate]);

	const testSaved = useCallback(
		async (name: string) => {
			setTestingName(name);
			setTestSnapshots((prev) => ({ ...prev, [name]: { status: "testing", detail: "", tableCount: 0 } }));
			try {
				const result = await testConnection({ connectionName: name });
				setTestSnapshots((prev) => ({
					...prev,
					[name]: { status: "ok", detail: result.detail, tableCount: result.tableCount },
				}));
				recordSettingsUsage({ tab: "database", action: "tested", target: "connection" });
			} catch (caught) {
				const { detail } = formatError(t, caught);
				setTestSnapshots((prev) => ({
					...prev,
					[name]: { status: "failed", detail: detail ?? "", tableCount: 0 },
				}));
			} finally {
				setTestingName(null);
			}
		},
		[t],
	);

	const remove = useCallback(
		(name: string) => {
			setConfirm({
				title: t("databaseDeleteConfirm"),
				message: t("databaseDeleteMessage", { name }),
				confirmLabel: t("databaseDelete"),
				variant: "danger",
				onConfirm: () => {
					void removeConnection(name)
						.then(() => {
							recordSettingsUsage({ tab: "database", action: "deleted", target: "connection" });
							return refresh();
						})
						.catch((caught) => {
							const { message, detail } = formatError(t, caught);
							setError(message);
							setErrorDetail(detail);
						});
				},
			});
		},
		[refresh, setConfirm, t],
	);

	const toggleSchemaInjection = useCallback(async () => {
		setSchemaInjectionBusy(true);
		try {
			const next = !schemaInjection;
			await window.astravia.config.set({ database: { schemaInjection: next } });
			setSchemaInjection(next);
			recordSettingsUsage({ tab: "database", action: next ? "enabled" : "disabled", target: "schema-injection" });
		} finally {
			setSchemaInjectionBusy(false);
		}
	}, [schemaInjection]);

	// B2.10-W4-① 感知范围：任何范围变更即时持久化 + 埋点（value 为范围摘要，非用户可见文案）。
	const saveSchemaInjectionScope = useCallback(async (next: SchemaInjectionScopeData) => {
		setSchemaInjectionScopeBusy(true);
		try {
			await window.astravia.config.set({ database: { schemaInjectionScope: next } });
			setSchemaInjectionScope(next);
			const label =
				next.scope === "all"
					? "all"
					: next.scope === "connections"
						? `connections:${next.connections.length}`
						: `tables:${next.tables.length}`;
			recordSettingsUsage({ tab: "database", action: "changed", target: "schema-injection-scope", value: label });
		} finally {
			setSchemaInjectionScopeBusy(false);
		}
	}, []);

	const setSchemaInjectionScopeKind = useCallback(
		(scope: SchemaInjectionScopeKind) => {
			void saveSchemaInjectionScope({ ...schemaInjectionScope, scope });
		},
		[saveSchemaInjectionScope, schemaInjectionScope],
	);

	const toggleScopeConnection = useCallback(
		(name: string) => {
			const has = schemaInjectionScope.connections.includes(name);
			const connections = has
				? schemaInjectionScope.connections.filter((c) => c !== name)
				: [...schemaInjectionScope.connections, name];
			void saveSchemaInjectionScope({ ...schemaInjectionScope, connections });
		},
		[saveSchemaInjectionScope, schemaInjectionScope],
	);

	const toggleScopeTable = useCallback(
		(connection: string, table: string) => {
			const has = schemaInjectionScope.tables.some((t) => t.connection === connection && t.table === table);
			const tables = has
				? schemaInjectionScope.tables.filter((t) => !(t.connection === connection && t.table === table))
				: [...schemaInjectionScope.tables, { connection, table }];
			void saveSchemaInjectionScope({ ...schemaInjectionScope, tables });
		},
		[saveSchemaInjectionScope, schemaInjectionScope],
	);

	const loadConnectionTables = useCallback(
		async (connection: string) => {
			if (connectionTables[connection] || loadingTablesFor) return;
			setLoadingTablesFor(connection);
			try {
				const tables = await listTables(connection);
				setConnectionTables((prev) => ({ ...prev, [connection]: tables }));
			} catch {
				// 表清单加载失败静默：chips 区保持未加载态，用户可再次点击重试。
			} finally {
				setLoadingTablesFor(null);
			}
		},
		[connectionTables, loadingTablesFor],
	);

	const toggleDbxToolAccess = useCallback(async () => {
		setDbxToolBusy(true);
		try {
			const next = !dbxToolEnabled;
			await window.astravia.config.set({ database: { dbxToolEnabled: next } });
			setDbxToolEnabled(next);
			recordSettingsUsage({ tab: "database", action: next ? "enabled" : "disabled", target: "dbx-tool-access" });
		} finally {
			setDbxToolBusy(false);
		}
	}, [dbxToolEnabled]);

	// W4-② 显式授权/撤销生产写操作：开启需确认弹窗（敏感操作），关闭直接撤销并持久化 + 埋点。
	const toggleProdWriteApproved = useCallback(
		(name: string) => {
			const next = !prodWriteApproved[name];
			const persist = async (): Promise<void> => {
				setProdWriteApprovedBusy(true);
				try {
					await window.astravia.config.set({
						database: { prodWriteApproved: { ...prodWriteApproved, [name]: next } },
					});
					setProdWriteApproved((prev) => ({ ...prev, [name]: next }));
					recordSettingsUsage({
						tab: "database",
						action: next ? "enabled" : "disabled",
						target: "prod-write-approved",
						value: name,
					});
				} finally {
					setProdWriteApprovedBusy(false);
				}
			};
			if (next) {
				setConfirm({
					title: t("databaseProdWriteConfirm"),
					message: t("databaseProdWriteConfirmMessage", { name }),
					confirmLabel: t("databaseProdWriteApprove"),
					variant: "danger",
					onConfirm: () => {
						void persist();
					},
				});
			} else {
				void persist();
			}
		},
		[prodWriteApproved, setConfirm, t],
	);

	const selected = useMemo(
		() => connections.find((connection) => connection.name === selectedName) ?? null,
		[connections, selectedName],
	);

	return {
		schemaInjection,
		schemaInjectionBusy,
		schemaInjectionScope,
		schemaInjectionScopeBusy,
		connectionTables,
		loadingTablesFor,
		dbxToolEnabled,
		dbxToolBusy,
		prodWriteApproved,
		prodWriteApprovedBusy,
		addOpen,
		connections,
		error,
		errorDetail,
		form,
		formBusy,
		formError,
		formErrorDetail,
		formTestResult,
		formTesting,
		loading,
		selected,
		testSnapshots,
		testingName,
		actions: {
			cancelAdd,
			changeForm,
			openAdd,
			pickFile,
			refresh,
			remove,
			select: setSelectedName,
			submitAdd,
			testDraft,
			testSaved,
			toggleSchemaInjection,
			setSchemaInjectionScopeKind,
			toggleScopeConnection,
			toggleScopeTable,
			loadConnectionTables,
			toggleDbxToolAccess,
			toggleProdWriteApproved,
		},
	};
}
