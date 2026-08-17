/**
 * Model + thinking-level controller.
 *
 * Extracted from AgentSession. Owns the scoped-model list (--models flag) and
 * all model-switch / thinking-level logic. Reads the current model and thinking
 * level live from the agent via SessionContext.
 */

import type { ThinkingLevel } from "@astravia/agent-core";
import type { Model } from "@astravia/ai";
import { modelsAreEqual, supportsXhigh } from "@astravia/ai";
import type { SessionContext } from "./session-context.js";

/** Standard thinking levels */
const THINKING_LEVELS: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high"];

/** Thinking levels including xhigh (for supported models) */
const THINKING_LEVELS_WITH_XHIGH: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh"];

/** Result from cycleModel() */
export interface ModelCycleResult {
	model: Model<any>;
	thinkingLevel: ThinkingLevel;
	/** Whether cycling through scoped models (--models flag) or all available */
	isScoped: boolean;
}

export class ModelController {
	constructor(
		private readonly ctx: SessionContext,
		private _scopedModels: Array<{ model: Model<any>; thinkingLevel: ThinkingLevel }>,
	) {}

	private get model(): Model<any> | undefined {
		return this.ctx.model;
	}

	private get thinkingLevel(): ThinkingLevel {
		return this.ctx.agent.state.thinkingLevel;
	}

	get scopedModels(): ReadonlyArray<{ model: Model<any>; thinkingLevel: ThinkingLevel }> {
		return this._scopedModels;
	}

	setScopedModels(scopedModels: Array<{ model: Model<any>; thinkingLevel: ThinkingLevel }>): void {
		this._scopedModels = scopedModels;
	}

	async emitModelSelect(
		nextModel: Model<any>,
		previousModel: Model<any> | undefined,
		source: "set" | "cycle" | "restore",
	): Promise<void> {
		const runner = this.ctx.extensionRunner;
		if (!runner) return;
		if (modelsAreEqual(previousModel, nextModel)) return;
		await runner.emit({
			type: "model_select",
			model: nextModel,
			previousModel,
			source,
		});
	}

	/**
	 * Set model directly.
	 * Validates API key, saves to session and settings.
	 * @throws Error if no API key available for the model
	 */
	async setModel(model: Model<any>): Promise<void> {
		const apiKey = await this.ctx.modelRegistry.getApiKey(model);
		if (!apiKey) {
			throw new Error(`No API key for ${model.provider}/${model.id}`);
		}

		const previousModel = this.model;
		this.ctx.agent.setModel(model);
		this.ctx.sessionManager.appendModelChange(model.provider, model.id);
		this.ctx.settingsManager.setDefaultModelAndProvider(model.provider, model.id);

		// Re-clamp thinking level for new model's capabilities
		this.setThinkingLevel(this.thinkingLevel);

		await this.emitModelSelect(model, previousModel, "set");
	}

	/**
	 * Cycle to next/previous model.
	 * Uses scoped models (from --models flag) if available, otherwise all available models.
	 * @param direction - "forward" (default) or "backward"
	 * @returns The new model info, or undefined if only one model available
	 */
	async cycleModel(direction: "forward" | "backward" = "forward"): Promise<ModelCycleResult | undefined> {
		if (this._scopedModels.length > 0) {
			return this.cycleScopedModel(direction);
		}
		return this.cycleAvailableModel(direction);
	}

	private async getScopedModelsWithApiKey(): Promise<Array<{ model: Model<any>; thinkingLevel: ThinkingLevel }>> {
		const apiKeysByProvider = new Map<string, string | undefined>();
		const result: Array<{ model: Model<any>; thinkingLevel: ThinkingLevel }> = [];

		for (const scoped of this._scopedModels) {
			const provider = scoped.model.provider;
			let apiKey: string | undefined;
			if (apiKeysByProvider.has(provider)) {
				apiKey = apiKeysByProvider.get(provider);
			} else {
				apiKey = await this.ctx.modelRegistry.getApiKeyForProvider(provider);
				apiKeysByProvider.set(provider, apiKey);
			}

			if (apiKey) {
				result.push(scoped);
			}
		}

		return result;
	}

	private async cycleScopedModel(direction: "forward" | "backward"): Promise<ModelCycleResult | undefined> {
		const scopedModels = await this.getScopedModelsWithApiKey();
		if (scopedModels.length <= 1) return undefined;

		const currentModel = this.model;
		let currentIndex = scopedModels.findIndex((sm) => modelsAreEqual(sm.model, currentModel));

		if (currentIndex === -1) currentIndex = 0;
		const len = scopedModels.length;
		const nextIndex = direction === "forward" ? (currentIndex + 1) % len : (currentIndex - 1 + len) % len;
		const next = scopedModels[nextIndex];

		// Apply model
		this.ctx.agent.setModel(next.model);
		this.ctx.sessionManager.appendModelChange(next.model.provider, next.model.id);
		this.ctx.settingsManager.setDefaultModelAndProvider(next.model.provider, next.model.id);

		// Apply thinking level (setThinkingLevel clamps to model capabilities)
		this.setThinkingLevel(next.thinkingLevel);

		await this.emitModelSelect(next.model, currentModel, "cycle");

		return { model: next.model, thinkingLevel: this.thinkingLevel, isScoped: true };
	}

	private async cycleAvailableModel(direction: "forward" | "backward"): Promise<ModelCycleResult | undefined> {
		const availableModels = await this.ctx.modelRegistry.getAvailable();
		if (availableModels.length <= 1) return undefined;

		const currentModel = this.model;
		let currentIndex = availableModels.findIndex((m) => modelsAreEqual(m, currentModel));

		if (currentIndex === -1) currentIndex = 0;
		const len = availableModels.length;
		const nextIndex = direction === "forward" ? (currentIndex + 1) % len : (currentIndex - 1 + len) % len;
		const nextModel = availableModels[nextIndex];

		const apiKey = await this.ctx.modelRegistry.getApiKey(nextModel);
		if (!apiKey) {
			throw new Error(`No API key for ${nextModel.provider}/${nextModel.id}`);
		}

		this.ctx.agent.setModel(nextModel);
		this.ctx.sessionManager.appendModelChange(nextModel.provider, nextModel.id);
		this.ctx.settingsManager.setDefaultModelAndProvider(nextModel.provider, nextModel.id);

		// Re-clamp thinking level for new model's capabilities
		this.setThinkingLevel(this.thinkingLevel);

		await this.emitModelSelect(nextModel, currentModel, "cycle");

		return { model: nextModel, thinkingLevel: this.thinkingLevel, isScoped: false };
	}

	/**
	 * Set thinking level.
	 * Clamps to model capabilities based on available thinking levels.
	 * Saves to session and settings only if the level actually changes.
	 */
	setThinkingLevel(level: ThinkingLevel): void {
		const availableLevels = this.getAvailableThinkingLevels();
		// Custom (non-canonical) levels — e.g. "max", "none" from a model's own configured
		// reasoning levels — are passed through verbatim: the caller (desktop / model config)
		// already validated them against the model, so clamping to the canonical set would
		// wrongly collapse them. Canonical levels keep the existing capability clamp.
		const isCanonical = THINKING_LEVELS_WITH_XHIGH.includes(level);
		const effectiveLevel = !isCanonical
			? level
			: availableLevels.includes(level)
				? level
				: this.clampThinkingLevel(level, availableLevels);

		// Only persist if actually changing
		const isChanging = effectiveLevel !== this.ctx.agent.state.thinkingLevel;

		this.ctx.agent.setThinkingLevel(effectiveLevel);

		if (isChanging) {
			this.ctx.sessionManager.appendThinkingLevelChange(effectiveLevel);
			this.ctx.settingsManager.setDefaultThinkingLevel(effectiveLevel);
		}
	}

	/**
	 * Cycle to next thinking level.
	 * @returns New level, or undefined if model doesn't support thinking
	 */
	cycleThinkingLevel(): ThinkingLevel | undefined {
		if (!this.supportsThinking()) return undefined;

		const levels = this.getAvailableThinkingLevels();
		const currentIndex = levels.indexOf(this.thinkingLevel);
		const nextIndex = (currentIndex + 1) % levels.length;
		const nextLevel = levels[nextIndex];

		this.setThinkingLevel(nextLevel);
		return nextLevel;
	}

	/**
	 * Get available thinking levels for current model.
	 * The provider will clamp to what the specific model supports internally.
	 */
	getAvailableThinkingLevels(): ThinkingLevel[] {
		if (!this.supportsThinking()) return ["off"];
		return this.supportsXhighThinking() ? THINKING_LEVELS_WITH_XHIGH : THINKING_LEVELS;
	}

	/** Check if current model supports xhigh thinking level. */
	supportsXhighThinking(): boolean {
		return this.model ? supportsXhigh(this.model) : false;
	}

	/** Check if current model supports thinking/reasoning. */
	supportsThinking(): boolean {
		return !!this.model?.reasoning;
	}

	clampThinkingLevel(level: ThinkingLevel, availableLevels: ThinkingLevel[]): ThinkingLevel {
		const ordered = THINKING_LEVELS_WITH_XHIGH;
		const available = new Set(availableLevels);
		const requestedIndex = ordered.indexOf(level);
		if (requestedIndex === -1) {
			return availableLevels[0] ?? "off";
		}
		for (let i = requestedIndex; i < ordered.length; i++) {
			const candidate = ordered[i];
			if (available.has(candidate)) return candidate;
		}
		for (let i = requestedIndex - 1; i >= 0; i--) {
			const candidate = ordered[i];
			if (available.has(candidate)) return candidate;
		}
		return availableLevels[0] ?? "off";
	}
}
