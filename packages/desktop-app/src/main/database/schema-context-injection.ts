import type { DbColumnInfo } from "../../preload/api-types/database.js";
import type { SchemaInjectionScopeConfig } from "../config/desktop-config-store.js";
import { databaseService } from "./database-service.js";

/**
 * B2.5 schema 上下文注入。
 *
 * 在 AI 对话会话创建时，把已配置连接的数据库表结构摘要追加到 system prompt
 * （appendSystemPrompt），让 AI 在不知道表结构的前提下也能生成正确 SQL。
 * 与 dbx MCP 工具（dbx_execute_query）配合使用：schema 帮助 AI 写 SQL，
 * MCP 工具负责实际执行。
 *
 * B2.10-W4-① 感知范围：opts.scope 决定注入范围——all（默认）= 全部连接全表；
 * connections = 仅白名单连接（连接级）；tables = 仅白名单「连接.表」（表级，
 * 经 dbx_describe_table 拼装）。
 *
 * 设计要点：
 * - 纯函数（renderSchemaContextBlock / summarizeSchema / formatTableSchema）与 IO
 *   （SchemaContextIo）分离，便于单测；
 * - 每连接/每表 schema 截断到字符上限，控制 token 开销；
 * - 任意失败静默跳过（不阻塞会话创建），进程级 TTL 缓存避免每次建会话
 *   都重复打 dbx MCP。
 */

/** 单个连接 schema 注入的字符上限（控制 token 开销）。 */
export const SCHEMA_CONTEXT_CHAR_LIMIT_PER_CONNECTION = 6_000;

/** 缓存有效期：连接/schema 变更后最多延迟该时长生效。 */
export const SCHEMA_CONTEXT_CACHE_TTL_MS = 60_000;

/** 组装后的单个注入条目。 */
export interface SchemaContextEntry {
	connectionName: string;
	/** 表级注入（B2.10-W4-①）：仅白名单表时携带表名，渲染为「连接 x 表 y」。 */
	tableName?: string;
	schema: string;
}

/** 注入所需的 IO（生产实现走 databaseService，测试可 mock）。 */
export interface SchemaContextIo {
	listConnections(): Promise<Array<{ name: string }>>;
	/** 返回连接 schema 文本；失败时抛错（调用方静默跳过）。 */
	getSchemaContext(connectionName: string): Promise<string>;
	/** 返回单表 schema 文本（B2.10-W4-① 表级注入）；失败时抛错（调用方静默跳过）。 */
	getTableSchemaContext(connectionName: string, table: string): Promise<string>;
}

/** 摘要化：超限截断，保留开头并标注截断信息。 */
export function summarizeSchema(schema: string, limit = SCHEMA_CONTEXT_CHAR_LIMIT_PER_CONNECTION): string {
	if (schema.length <= limit) return schema;
	return `${schema.slice(0, limit)}\n…(schema 已截断，共 ${schema.length} 字符，仅展示前 ${limit} 字符)`;
}

/** 组装 schema 提示词块的选项。 */
export interface SchemaContextRenderOptions {
	/** dbx MCP 工具（dbx_execute_query 等）是否可用（AI 访问开关 database.dbxToolEnabled）。缺省 true。 */
	readonly executeToolAvailable?: boolean;
	/** 感知范围（B2.10-W4-①）：缺省 all（全部连接全表）。 */
	readonly scope?: SchemaInjectionScopeConfig;
}

/** 组装可注入的 schema 提示词块（纯函数）。无条目时返回空串。 */
export function renderSchemaContextBlock(entries: SchemaContextEntry[], opts?: SchemaContextRenderOptions): string {
	if (entries.length === 0) return "";
	const exampleTable = entries.find((entry) => entry.tableName)?.tableName ?? firstTableName(entries[0]?.schema ?? "");
	const executeToolAvailable = opts?.executeToolAvailable !== false;
	const body = entries
		.map((entry) => {
			const title = entry.tableName
				? `### 连接「${entry.connectionName}」表「${entry.tableName}」`
				: `### 连接「${entry.connectionName}」`;
			return `${title}\n${summarizeSchema(entry.schema)}`;
		})
		.join("\n\n");
	// B2.10-W2：感知开关只管注入；工具可用性由「AI 访问」开关决定。工具不可用时不再指示调用 dbx 工具，
	// 避免模型在对话里调用不存在的工具（Tool dbx_execute_query not found）。
	const executionLine = executeToolAvailable
		? "执行查询请调用 dbx MCP 的 dbx_execute_query 工具，connection_name 必须使用上方列出的连接名；只允许只读 SELECT 查询。"
		: "注意：数据库 AI 访问未开启（工作台「数据库」页的「AI 访问」开关关闭），dbx MCP 工具不可用，无法执行查询；不要调用 dbx_* 工具。如需执行 SQL，请告知用户先在工作台开启「AI 访问」。";
	// B3.3 few-shot：从首个条目解析真实表名，注入只读 SELECT 示例，帮助自然语言转 SQL 生成。
	return [
		"## 数据库 Schema 上下文（AI 数据库感知已开启）",
		"以下是已启用连接的数据库表结构。编写 SQL 时直接依据这些结构，不要臆造列名或表名。",
		executionLine,
		body,
		...(exampleTable
			? [`## 参考 SQL 示例（只读 SELECT，表名与语法可直接参考）\n${buildSqlExamples(exampleTable)}`]
			: []),
	].join("\n\n");
}

/** 从 schema 文本解析第一个表名（匹配 `name (` 行；B3.3 few-shot 示例用）。 */
export function firstTableName(schema: string): string | undefined {
	const m = schema.match(/^\s*([A-Za-z_][A-Za-z0-9_$]*)\s*\(/m);
	return m ? m[1] : undefined;
}

/** 生成基于真实表名的只读 SELECT few-shot 示例（B3.3 自然语言转 SQL 增强）。 */
export function buildSqlExamples(tableName: string): string {
	const quoted = `"${tableName.replace(/"/g, '""')}"`;
	return [
		"-- 示例 1：浏览数据（前 100 行）",
		`SELECT * FROM ${quoted} LIMIT 100;`,
		"-- 示例 2：按条件过滤（请把 example_column 替换为真实列名）",
		`SELECT * FROM ${quoted} WHERE "example_column" = 'value' LIMIT 100;`,
		"-- 示例 3：统计行数",
		`SELECT COUNT(*) AS total FROM ${quoted};`,
	].join("\n");
}

/** 进程级缓存：连接级 key = connectionName，表级 key = tableCacheKey(...)。 */
const schemaCache = new Map<string, { schema: string; fetchedAt: number }>();

function cachedSchema(io: SchemaContextIo, connectionName: string): Promise<string> {
	const hit = schemaCache.get(connectionName);
	if (hit && Date.now() - hit.fetchedAt < SCHEMA_CONTEXT_CACHE_TTL_MS) {
		return Promise.resolve(hit.schema);
	}
	return io.getSchemaContext(connectionName).then((schema) => {
		schemaCache.set(connectionName, { schema, fetchedAt: Date.now() });
		return schema;
	});
}

/** 清理缓存（测试与连接变更时使用）。 */
export function clearSchemaContextCache(): void {
	schemaCache.clear();
}

/** 表级 schema 缓存 key（与连接级区分）。 */
function tableCacheKey(connectionName: string, table: string): string {
	return `table\u0000${connectionName}\u0000${table}`;
}

function cachedTableSchema(io: SchemaContextIo, connectionName: string, table: string): Promise<string> {
	const key = tableCacheKey(connectionName, table);
	const hit = schemaCache.get(key);
	if (hit && Date.now() - hit.fetchedAt < SCHEMA_CONTEXT_CACHE_TTL_MS) {
		return Promise.resolve(hit.schema);
	}
	return io.getTableSchemaContext(connectionName, table).then((schema) => {
		schemaCache.set(key, { schema, fetchedAt: Date.now() });
		return schema;
	});
}

/**
 * 构建注入用的 schema 提示词块。
 * 失败（引擎未运行 / 无连接 / 单连接读 schema 失败）一律返回 undefined，不抛错。
 */
export async function buildDatabaseSchemaPrompt(
	io: SchemaContextIo,
	opts?: SchemaContextRenderOptions,
): Promise<string | undefined> {
	try {
		const scope = opts?.scope;
		// B2.10-W4-① 感知范围：tables = 仅白名单「连接.表」；connections = 仅白名单连接；其余 = 全部连接全表。
		if (scope?.scope === "tables") {
			if (scope.tables.length === 0) return undefined;
			const entries: SchemaContextEntry[] = [];
			for (const target of scope.tables) {
				try {
					const schema = await cachedTableSchema(io, target.connection, target.table);
					if (schema.trim()) entries.push({ connectionName: target.connection, tableName: target.table, schema });
				} catch {
					// 单表失败静默跳过：不影响其它表与会话创建。
				}
			}
			if (entries.length === 0) return undefined;
			return renderSchemaContextBlock(entries, opts);
		}

		const connections = await io.listConnections();
		if (connections.length === 0) return undefined;
		const allow = scope?.scope === "connections" ? new Set(scope.connections) : null;
		const targets = allow ? connections.filter((connection) => allow.has(connection.name)) : connections;
		if (targets.length === 0) return undefined;
		const entries: SchemaContextEntry[] = [];
		for (const connection of targets) {
			try {
				const schema = await cachedSchema(io, connection.name);
				if (schema.trim()) entries.push({ connectionName: connection.name, schema });
			} catch {
				// 单连接失败静默跳过：不影响其它连接与会话创建。
			}
		}
		if (entries.length === 0) return undefined;
		return renderSchemaContextBlock(entries, opts);
	} catch {
		return undefined;
	}
}

/** 生产用 IO：对接 main 进程 databaseService（DatabaseResult 解包）。 */
export const databaseSchemaContextIo: SchemaContextIo = {
	async listConnections() {
		const result = await databaseService.listConnections();
		return result.ok ? result.data : [];
	},
	async getSchemaContext(connectionName) {
		const result = await databaseService.getSchemaContext(connectionName);
		if (!result.ok) throw new Error(result.error.detail);
		return result.data;
	},
	async getTableSchemaContext(connectionName, table) {
		const result = await databaseService.describeTable(connectionName, table);
		if (!result.ok) throw new Error(result.error.detail);
		return formatTableSchema(table, result.data);
	},
};

/**
 * 把单表列结构格式化为 schema 文本（B2.10-W4-① 表级注入）。
 * 列名/类型/主键/非空/默认值/注释，对齐 dbx_get_schema_context 的信息粒度。
 */
export function formatTableSchema(table: string, columns: DbColumnInfo[]): string {
	const lines = columns.map((column) => {
		const parts = [column.name, column.type || "unknown"];
		if (column.isPrimaryKey) parts.push("PRIMARY KEY");
		if (!column.nullable) parts.push("NOT NULL");
		if (column.hasDefault && column.defaultValue) parts.push(`DEFAULT ${column.defaultValue}`);
		if (column.comment) parts.push(`-- ${column.comment}`);
		return `  ${parts.join(" ")}`;
	});
	return `${table} (\n${lines.join("\n")}\n)`;
}
