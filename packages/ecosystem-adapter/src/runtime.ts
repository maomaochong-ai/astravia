import { createClaudeHookAdapter } from "./claude-code/hooks/adapter.js";
import { createCodexHookAdapter } from "./codex/hooks/adapter.js";
import { type EcosystemHookAdapter, type EcosystemHookHost, EcosystemHookRuntime } from "./hooks/runtime.js";
import type { HookConfigLayer, HookDiagnostic, HookRunSummary, SessionStartSource } from "./hooks/types.js";

export interface EcosystemHookAdapterFactoryContext {
	cwd: string;
	configLayers: readonly HookConfigLayer[];
	onDiagnostic(diagnostic: HookDiagnostic): void;
	onFailedRun(summary: HookRunSummary): void;
}

export type EcosystemHookAdapterFactory = (
	context: EcosystemHookAdapterFactoryContext,
) => Promise<EcosystemHookAdapter | undefined>;

export interface CreateEcosystemHookRuntimeOptions {
	host: EcosystemHookHost;
	initialSessionStartSource: SessionStartSource;
	adapterFactories?: readonly EcosystemHookAdapterFactory[];
	additionalAdapterFactories?: readonly EcosystemHookAdapterFactory[];
	configLayers?: readonly HookConfigLayer[];
	maxStopContinuations?: number;
	onDiagnostic?: (diagnostic: HookDiagnostic) => void;
	onFailedRun?: (summary: HookRunSummary) => void;
}

const BUILT_IN_ADAPTER_FACTORIES: readonly EcosystemHookAdapterFactory[] = [
	async (context) => {
		return createCodexHookAdapter({
			configLayers: context.configLayers,
			onDiagnostic: context.onDiagnostic,
			onFailedRun: context.onFailedRun,
		});
	},
	async (context) => {
		return createClaudeHookAdapter({
			configLayers: context.configLayers,
			projectDir: context.cwd,
			onDiagnostic: context.onDiagnostic,
			onFailedRun: context.onFailedRun,
		});
	},
];

export function createEcosystemHookRuntime(options: CreateEcosystemHookRuntimeOptions): EcosystemHookRuntime {
	const factories = [
		...(options.adapterFactories ?? BUILT_IN_ADAPTER_FACTORIES),
		...(options.additionalAdapterFactories ?? []),
	];
	return new EcosystemHookRuntime({
		host: options.host,
		initialSessionStartSource: options.initialSessionStartSource,
		maxStopContinuations: options.maxStopContinuations,
		loadAdapters: async () => {
			const context: EcosystemHookAdapterFactoryContext = {
				cwd: options.host.cwd,
				configLayers: options.configLayers ?? [],
				onDiagnostic: options.onDiagnostic ?? reportDiagnostic,
				onFailedRun: options.onFailedRun ?? reportFailedRun,
			};
			const results = await Promise.allSettled(factories.map((factory) => factory(context)));
			for (const result of results) {
				if (result.status === "rejected") console.warn("[ecosystem-hooks] adapter factory failed", result.reason);
			}
			return results
				.filter(
					(result): result is PromiseFulfilledResult<EcosystemHookAdapter | undefined> =>
						result.status === "fulfilled",
				)
				.map((result) => result.value)
				.filter((adapter): adapter is EcosystemHookAdapter => adapter !== undefined);
		},
	});
}

function reportDiagnostic(diagnostic: HookDiagnostic): void {
	console.warn(`[ecosystem-hooks] ${diagnostic.sourcePath}: ${diagnostic.message}`);
}

function reportFailedRun(summary: HookRunSummary): void {
	if (summary.status !== "Failed") return;
	const details = summary.entries.map((entry) => entry.text).join("; ");
	console.warn(
		`[ecosystem-hooks] ${summary.profileId} ${summary.eventName} failed (${summary.sourcePath}): ${details}`,
	);
}
