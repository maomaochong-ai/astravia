import { pageHeaderTitleHiddenAtom } from "@shared/store/atoms";
import { useSetAtom } from "jotai";
import { useEffect } from "react";
import { DatabaseConnectionsWorkspace } from "./DatabaseConnectionsWorkspace";

/**
 * /database 路由页（B2.6-R 职责分离后）：仅连接配置管理。
 * 三栏经典数据库工具界面已迁至活动面板「数据库」标签页；
 * 旧深链 ?connection=&table= 不再消费（产品未公开发布，无存量用户）。
 */
export function DatabasePage(): JSX.Element {
	const setHeaderTitleHidden = useSetAtom(pageHeaderTitleHiddenAtom);

	useEffect(() => {
		setHeaderTitleHidden(true);
		return () => setHeaderTitleHidden(false);
	}, [setHeaderTitleHidden]);

	return (
		<div className="relative flex h-full w-full flex-1 flex-col overflow-hidden">
			<DatabaseConnectionsWorkspace />
		</div>
	);
}
