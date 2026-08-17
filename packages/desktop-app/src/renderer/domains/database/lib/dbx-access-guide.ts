/**
 * 「对话里带表但 AI 访问关闭」引导判定（B2.10-W2 收尾）。
 *
 * dbxToolEnabled 缺省关时 dbx MCP 工具不注册进对话工具集，AI 无法调用
 * dbx_execute_query 执行 SQL（对话侧表现为 "tool not found"）。用户在对话里
 * 带表目标却期待 AI 查询时，需要在用户消息上提示去开启「AI 访问数据库」开关。
 *
 * 判定：有表目标 && 访问开关未开启 → 需要提示。纯函数便于单测。
 */
export interface DbTableTargetLike {
	connection?: string;
	table?: string;
}

export function shouldShowDbxAccessGuide(
	databaseTable: DbTableTargetLike | null | undefined,
	dbxToolEnabled: boolean,
): boolean {
	if (!databaseTable || !databaseTable.table) return false;
	return dbxToolEnabled !== true;
}
