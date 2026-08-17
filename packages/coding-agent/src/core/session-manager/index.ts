/**
 * SessionManager 业务包入口（按业务域，非技术分层）。
 *
 * | 文件 | 业务 |
 * |------|------|
 * | session-model | 会话数据模型 |
 * | format-compat | 历史格式兼容 |
 * | llm-context | LLM 上下文组装 |
 * | session-catalog | 会话目录/列表 |
 * | session-store | 内存态 + JSONL 落盘原语 |
 * | session-lifecycle | 新建/打开/切换会话 |
 * | transcript-write | 对话记录写入 |
 * | tree-navigation | 树查询与 leaf 切换 |
 * | message-edit | 消息删除/替换 |
 * | session-fork | 分支导出 / fork / rollover |
 * | branch-ops | tip/export/rollover 纯函数 |
 * | manager | 公共门面（委托，无业务堆叠） |
 */

export { SessionLockError } from "../session-lock.js";
export { loadEntriesFromFile, migrateSessionEntries, parseSessionEntries } from "./format-compat.js";
export { buildSessionContext, getLatestCompactionEntry } from "./llm-context.js";
export { type ReadonlySessionManager, SessionManager } from "./manager.js";
export { findMostRecentSession, type SessionListProgress } from "./session-catalog.js";
export {
	type BranchSummaryEntry,
	type CompactionEntry,
	CURRENT_SESSION_VERSION,
	type CustomEntry,
	type CustomMessageEntry,
	type FileEntry,
	type LabelEntry,
	type ModelChangeEntry,
	type NewSessionOptions,
	type SessionContext,
	type SessionEntry,
	type SessionEntryBase,
	type SessionHeader,
	type SessionInfo,
	type SessionInfoEntry,
	type SessionMessageEntry,
	type SessionTreeNode,
	type ThinkingLevelChangeEntry,
	type ToolTimingEntry,
} from "./session-model.js";
