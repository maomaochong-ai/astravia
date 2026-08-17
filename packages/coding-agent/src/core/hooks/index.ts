export {
	type BuildDefaultHookConfigLayersOptions,
	buildDefaultHookConfigLayers,
	createEcosystemHookRuntime,
	type EcosystemHookAdapter,
	type EcosystemHookAdapterFactory,
	type EcosystemHookHost,
	EcosystemHookRuntime,
} from "@astravia/ecosystem-adapter";
export { type EcosystemHookAwareTool, wrapToolsWithEcosystemHooks } from "./tool-wrapper.js";
