import { type Static, Type } from "@sinclair/typebox";
import type { CodingAgentTool } from "../../session/tool-scope.js";
import { toolCallDescriptionSchema } from "../../tools/tool-call-description.js";
import type { SubagentCoordinator } from "../coordinator.js";

const spawnAgentSchema = Type.Object({
	description: toolCallDescriptionSchema,
	task_name: Type.String({
		description:
			"Unique snake_case name for this child under the root (e.g. api_trace). Lowercase letters, digits, underscore; start with a letter.",
	}),
	message: Type.String({
		description: "Task instructions for the subagent. Be specific about what to investigate and what to return.",
	}),
	agent_type: Type.String({
		description: "Registered subagent type id (e.g. explorer). See tool description for available types.",
	}),
});

export type SpawnAgentToolInput = Static<typeof spawnAgentSchema>;

export function createSpawnAgentTool(options: {
	getCoordinator: () => SubagentCoordinator | undefined;
}): CodingAgentTool<typeof spawnAgentSchema> {
	return {
		name: "spawn_agent",
		label: "spawn_agent",
		scope_use: ["conversation", "project", "cli"],
		category: "agent-control",
		description: [
			"Spawn a background subagent (independent session) to gather information or do specialized work.",
			"Returns immediately with id/path/status; use wait_agent or wait for <subagent_notification>.",
			"Does not block the root agent. Multiple explorers may run in parallel (concurrency limit applies).",
			"",
			"Agent types are registry-based; currently registered types are listed at runtime via list_agents / this tool's errors.",
			"Typical first type: explorer — read-only recon + parent MCP search; never edits files. Root agent applies changes.",
		].join("\n"),
		parameters: spawnAgentSchema,
		execute: async (_toolCallId, input: SpawnAgentToolInput) => {
			const coord = options.getCoordinator();
			if (!coord) {
				throw new Error("Subagents are not enabled for this session.");
			}
			const snap = await coord.spawn({
				taskName: input.task_name,
				message: input.message,
				agentType: input.agent_type,
			});
			const text = [
				`Spawned subagent ${snap.id}`,
				`path: ${snap.path}`,
				`type: ${snap.agentType}`,
				`status: ${snap.status}`,
				`task_name: ${snap.taskName}`,
				"Use wait_agent to join, or continue and handle <subagent_notification>.",
			].join("\n");
			return {
				content: [{ type: "text" as const, text }],
				details: { ...snap },
			};
		},
	};
}
