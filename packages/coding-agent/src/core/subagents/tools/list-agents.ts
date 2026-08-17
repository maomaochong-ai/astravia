import { type Static, Type } from "@sinclair/typebox";
import type { CodingAgentTool } from "../../session/tool-scope.js";
import { toolCallDescriptionSchema } from "../../tools/tool-call-description.js";
import type { SubagentCoordinator } from "../coordinator.js";

const listAgentsSchema = Type.Object({
	description: toolCallDescriptionSchema,
});

export type ListAgentsToolInput = Static<typeof listAgentsSchema>;

export function createListAgentsTool(options: {
	getCoordinator: () => SubagentCoordinator | undefined;
}): CodingAgentTool<typeof listAgentsSchema> {
	return {
		name: "list_agents",
		label: "list_agents",
		scope_use: ["conversation", "project", "cli"],
		category: "agent-control",
		description:
			"List all subagents for this root session (id, path, type, status, task). Does not consume completion results.",
		parameters: listAgentsSchema,
		execute: async () => {
			const coord = options.getCoordinator();
			if (!coord) throw new Error("Subagents are not enabled for this session.");
			const agents = coord.list();
			const types = coord.registeredTypeIds();
			if (agents.length === 0) {
				return {
					content: [
						{
							type: "text" as const,
							text: `No subagents yet. Registered types: ${types.join(", ") || "(none)"}.`,
						},
					],
					details: { agents: [], registeredTypes: types },
				};
			}
			const lines = agents.map(
				(a) =>
					`- ${a.path} id=${a.id} type=${a.agentType} status=${a.status} task=${JSON.stringify(a.task.slice(0, 120))}`,
			);
			return {
				content: [
					{
						type: "text" as const,
						text: [`Registered types: ${types.join(", ")}`, "Agents:", ...lines].join("\n"),
					},
				],
				details: { agents, registeredTypes: types },
			};
		},
	};
}
