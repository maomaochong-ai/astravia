import type { AnyCapabilityToken, CapabilityId, CapabilityLayer, CapabilityToken } from "./contracts.js";
import type { CapabilityJsonSchema } from "./schema.js";

export interface CapabilityCatalogEntry {
	readonly id: CapabilityId;
	readonly inputSchema: CapabilityJsonSchema;
	readonly kind: CapabilityToken<unknown, unknown>["kind"];
	readonly layer: CapabilityLayer;
	readonly outputSchema: CapabilityJsonSchema;
	readonly version: number;
}

export function createCapabilityCatalog(
	capabilities: readonly AnyCapabilityToken[],
): readonly CapabilityCatalogEntry[] {
	const ids = new Set<CapabilityId>();
	return Object.freeze(
		capabilities.map((capability) => {
			if (ids.has(capability.id)) {
				throw new Error(`Capability catalog contains duplicate id: ${capability.id}`);
			}
			ids.add(capability.id);
			return Object.freeze({
				id: capability.id,
				inputSchema: capability.input.jsonSchema,
				kind: capability.kind,
				layer: capability.layer,
				outputSchema: capability.output.jsonSchema,
				version: capability.version,
			});
		}),
	);
}
