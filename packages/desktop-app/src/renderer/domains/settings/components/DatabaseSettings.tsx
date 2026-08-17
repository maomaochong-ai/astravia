import { DatabaseConnectionsWorkspace } from "../../database/components/DatabaseConnectionsWorkspace";

/**
 * 数据库设置面板入口（B2.6-R）：与 /database 页面一致，仅连接配置管理。
 * 三栏经典数据库工具界面在活动面板「数据库」标签页。
 */
export function DatabaseSettings(): JSX.Element {
	return <DatabaseConnectionsWorkspace />;
}
