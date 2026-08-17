import { TodoTabPanelView } from "@astravia/theme-ui/activity";
import { useTodoTabPanelModel } from "../hooks/useTodoTabPanelModel";

export function TodoTabPanel(): JSX.Element {
	const model = useTodoTabPanelModel();
	return (
		<TodoTabPanelView
			items={model.items}
			emptyLabel={model.emptyLabel}
			todoLabels={{
				allDone: "全部完成",
				pending: "待办",
				viewMore: "查看更多",
				collapse: "收起",
				expandRemaining: (n) => `展开全部（还有 ${n} 项）`,
			}}
		/>
	);
}
