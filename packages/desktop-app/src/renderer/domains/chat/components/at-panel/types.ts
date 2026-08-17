import type { AtPanelClassNames } from "@astravia/theme-ui/chat";

export type {
	AtPanelClassNames,
	AtPanelEntryModel,
	AtPanelLabels,
	AtPanelViewProps,
} from "@astravia/theme-ui/chat";

export interface SelectedFile {
	path: string;
	name: string;
	isDirectory: boolean;
}

export interface AtPanelProps {
	open: boolean;
	onClose: () => void;
	onSelect: (file: SelectedFile) => void;
	filter: string;
	cwd: string;
	className?: string;
	classNames?: AtPanelClassNames;
}
