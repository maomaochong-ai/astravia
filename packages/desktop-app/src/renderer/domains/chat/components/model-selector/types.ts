import type { ModelOption } from "@shared/components/ModelSelect/useModelOptions";

export interface ModelSelectorLabels {
	placeholder: string;
	searchPlaceholder: string;
	clearSearch: string;
	noResults: string;
	noResultsHint: string;
	reasoningHeader: string;
	modelHeader: string;
	visionBadge: string;
	defaultBadge: string;
	levelLabel: (value: string) => string;
}

export interface ModelSelectorProviderGroup {
	provider: string;
	label: string;
	icon?: string;
	models: ModelOption[];
}

export interface ModelSelectorViewProps {
	selectedModel?: string;
	selectedOption: ModelOption | null;
	currentLevel?: string;
	menuLevels: string[];
	groups: ModelSelectorProviderGroup[];
	defaultKey?: string;
	labels: ModelSelectorLabels;
	className?: string;
	classNames?: {
		trigger?: string;
		content?: string;
		contentInner?: string;
		providerHeader?: string;
		item?: string;
	};
	onModelSelect: (key: string) => void;
	onReasoningSelect: (value: string) => void;
}
