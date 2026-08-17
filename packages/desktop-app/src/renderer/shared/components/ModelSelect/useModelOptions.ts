import type { ModelsConfigData } from "@preload/api";
import { useEffect, useMemo, useState } from "react";

export interface ModelOption {
	provider: string;
	modelId: string;
	displayName: string;
	/** "provider/modelId" */
	key: string;
	/** Tags from models.json */
	tags?: string[];
	/** Whether this model supports image input */
	supportsImage?: boolean;
	/** API type ("openai-completions" / "openai-responses" / ...), for reasoning preset fallback */
	api?: string;
	/** Whether the model is reasoning-capable */
	reasoning?: boolean;
	/** Configured reasoning levels; empty/undefined falls back to the api-type preset */
	reasoningLevels?: string[];
	/** Default reasoning level when the user has not chosen one */
	defaultReasoningLevel?: string;
}

function flattenModels(config: ModelsConfigData): ModelOption[] {
	const result: ModelOption[] = [];
	for (const [provider, providerConfig] of Object.entries(config.providers)) {
		for (const model of providerConfig.models ?? []) {
			const raw = model as Record<string, unknown>;
			result.push({
				provider,
				modelId: model.id,
				displayName: model.name || model.id,
				key: `${provider}/${model.id}`,
				tags: Array.isArray(raw.tags) ? (raw.tags as string[]) : undefined,
				supportsImage: model.input?.includes("image") ?? false,
				api: model.api ?? providerConfig.api,
				reasoning: model.reasoning,
				reasoningLevels: model.reasoningLevels,
				defaultReasoningLevel: model.defaultReasoningLevel,
			});
		}
	}
	return result;
}

export interface UseModelOptionsResult {
	/** All configured model options */
	options: ModelOption[];
	/** Options grouped by provider, in insertion order */
	grouped: Map<string, ModelOption[]>;
	/** Configured default model key, if any */
	defaultKey: string | undefined;
	/** Resolve a provider's icon symbol */
	iconFor: (provider: string) => string | undefined;
	/** Resolve a provider's display label for group headers */
	labelFor: (provider: string) => string;
}

/**
 * Shared loader for the model picker: reads models.json and exposes grouping +
 * provider label/icon helpers. Used by every model selector so the option list
 * and provider metadata stay consistent across the app.
 */
export function useModelOptions(): UseModelOptionsResult {
	const [config, setConfig] = useState<ModelsConfigData | null>(null);

	useEffect(() => {
		void window.astravia.models.get().then(setConfig);
	}, []);

	const options = useMemo(() => (config ? flattenModels(config) : []), [config]);

	const grouped = useMemo(() => {
		const groups = new Map<string, ModelOption[]>();
		for (const m of options) {
			const list = groups.get(m.provider) ?? [];
			list.push(m);
			groups.set(m.provider, list);
		}
		return groups;
	}, [options]);

	const iconFor = (provider: string): string | undefined => {
		return (config?.providers[provider] as { icon?: string } | undefined)?.icon;
	};

	const labelFor = (provider: string): string => {
		const local = config?.providers[provider] as { displayName?: string } | undefined;
		return local?.displayName || provider;
	};

	return { options, grouped, defaultKey: config?.defaultModel, iconFor, labelFor };
}
