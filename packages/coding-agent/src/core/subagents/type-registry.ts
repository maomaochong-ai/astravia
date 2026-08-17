/**
 * Extensible registry of subagent type definitions.
 *
 * New types (worker, reviewer, …) register here without changing coordinator
 * or tool control-plane code. Only registered ids are accepted by spawn_agent.
 */

import type { SubagentTypeDefinition, SubagentTypeId, SubagentTypeRegistryLike } from "./types.js";

export class SubagentTypeRegistry implements SubagentTypeRegistryLike {
	private readonly types = new Map<SubagentTypeId, SubagentTypeDefinition>();

	register(definition: SubagentTypeDefinition): this {
		const id = definition.id.trim();
		if (!id) {
			throw new Error("Subagent type id must be non-empty");
		}
		if (this.types.has(id)) {
			throw new Error(`Subagent type "${id}" is already registered`);
		}
		this.types.set(id, definition);
		return this;
	}

	/** Replace or add (used by hosts that reconfigure types). */
	upsert(definition: SubagentTypeDefinition): this {
		const id = definition.id.trim();
		if (!id) {
			throw new Error("Subagent type id must be non-empty");
		}
		this.types.set(id, definition);
		return this;
	}

	get(id: SubagentTypeId): SubagentTypeDefinition | undefined {
		return this.types.get(id);
	}

	has(id: SubagentTypeId): boolean {
		return this.types.has(id);
	}

	list(): readonly SubagentTypeDefinition[] {
		return Array.from(this.types.values());
	}

	ids(): readonly SubagentTypeId[] {
		return Array.from(this.types.keys());
	}

	/** Snapshot for tool schema / docs. */
	describeForTools(): string {
		return this.list()
			.map((t) => `- \`${t.id}\`: ${t.description}`)
			.join("\n");
	}
}

/** Fresh registry with no types — callers add builtins explicitly. */
export function createEmptySubagentTypeRegistry(): SubagentTypeRegistry {
	return new SubagentTypeRegistry();
}
