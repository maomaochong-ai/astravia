import { databaseService } from "./database-service.js";

/**
 * B2.5 schema 上下文注入。
 *
 * 在 AI 对话会话创建时，把已配置连接的数据库表结构摘要追加到 system prompt
 * （appendSystemPrompt），让 AI 在不知道表结构的前提下也能生成正确 SQL。
 * 与 dbx MCP 工具（dbx_execute_query）配合使用：schema 帮助 AI 写 SQL，
 * MCP 工具负责实际执行。
 *
 * 设计要点：
 * - 纯函数（renderSchemaContextBlock / summarizeSchema）与 IO（SchemaContextIo）
 *   分离，便于单测；
 * - 每连接 schema 截断到字符上限，控制 token 开销；
 * - 任意失败静默跳过（不阻塞会话创建），进程级 TTL 缓存避免每次建会话
 *   都重复打 dbx MCP。
 */

/** 单个连接 schema 注入的字符上限（控制 token 开销）。 */
export const SCHEMA_CONTEXT_CHAR_LIMIT_PER_CONNECTION = 6_000;

/** 缓存有效期：连接/schema 变更后最多延迟该时长生效。 */
export const SCHEMA_CONTEXT_CACHE_TTL_MS = 60_000;

/** 组装后的单个连接条目。 */
export interface SchemaContextEntry {
	connectionName: string;
	schema: string;
}

/** 注入所需的 IO（生产实现走 databaseService，测试可 mock）。 */
export interface SchemaContextIo {
	listConnections(): Promise<Array<{ name: string }>>;
	/** 返回连接 schema 文本；失败时抛错（调用方静默跳过）。 */
	getSchemaContext(connectionName: string): Promise<string>;
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
}

/** 组装可注入的 schema 提示词块（纯函数）。无条目时返回空串。 */
export function renderSchemaContextBlock(entries: SchemaContextEntry[], opts?: SchemaContextRenderOptions): string {
	if (entries.length === 0) return "";
	const executeToolAvailable = opts?.executeToolAvailable !== false;
	const body = entries
		.map((entry) => `### 连接「${entry.connectionName}」\n${summarizeSchema(entry.schema)}`)
		.join("\n\n");
	// B2.10-W2：感知开关只管注入；工具可用性由「AI 访问」开关决定。工具不可用时不再指示调用 dbx 工具，
	// 避免模型在对话里调用不存在的工具（Tool dbx_execute_query not found）。
	const executionLine = executeToolAvailable
		? "执行查询请调用 dbx MCP 的 dbx_execute_query 工具，connection_name 必须使用上方列出的连接名；只允许只读 SELECT 查询。"
		: "注意：数据库 AI 访问未开启（工作台「数据库」页的「AI 访问」开关关闭），dbx MCP 工具不可用，无法执行查询；不要调用 dbx_* 工具。如需执行 SQL，请告知用户先在工作台开启「AI 访问」。";
	return [
		"## 数据库 Schema 上下文（AI 数据库感知已开启）",
		"以下是已启用连接的数据库表结构。编写 SQL 时直接依据这些结构，不要臆造列名或表名。",
		executionLine,
		body,
	].join("\n\n");
}

/** 进程级缓存：connectionName → { schema, fetchedAt }。 */
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

/**
 * 构建注入用的 schema 提示词块。
 * 失败（引擎未运行 / 无连接 / 单连接读 schema 失败）一律返回 undefined，不抛错。
 */
export async function buildDatabaseSchemaPrompt(
	io: SchemaContextIo,
	opts?: SchemaContextRenderOptions,
): Promise<string | undefined> {
	try {
		const connections = await io.listConnections();
		if (connections.length === 0) return undefined;
		const entries: SchemaContextEntry[] = [];
		for (const connection of connections) {
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
};
