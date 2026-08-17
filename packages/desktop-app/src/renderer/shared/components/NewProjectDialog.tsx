import { NewProjectDialogView } from "@astravia/theme-ui/project";

interface NewProjectDialogProps {
	onConfirm: (name: string) => void;
	onCancel: () => void;
}

/** Desktop adapter — copy matches legacy hardcoded strings for zero UI/behavior drift. */
export function NewProjectDialog({ onConfirm, onCancel }: NewProjectDialogProps): JSX.Element {
	return (
		<NewProjectDialogView
			onConfirm={onConfirm}
			onCancel={onCancel}
			labels={{
				title: "新建项目",
				description: "将在工作目录下创建一个新的项目文件夹。",
				placeholder: "输入项目名称",
				cancel: "取消",
				create: "创建",
				emptyError: "请输入项目名称",
				invalidError: "项目名称不能包含特殊字符",
			}}
		/>
	);
}
