import type { AgentTool } from "@astravia/agent-core";
import type { SubagentCoordinator } from "../coordinator.js";
import { createDispatchWorkflowsTool, DISPATCH_WORKFLOWS_MAX_BATCH } from "./dispatch-workflows.js";
import { createFollowupTaskTool } from "./followup-task.js";
import { createInterruptAgentTool } from "./interrupt-agent.js";
import { createListAgentsTool } from "./list-agents.js";
import { createSendMessageTool } from "./send-message.js";
import { createSpawnAgentTool } from "./spawn-agent.js";
import { createWaitAgentTool } from "./wait-agent.js";

export {
	createDispatchWorkflowsTool,
	createFollowupTaskTool,
	createInterruptAgentTool,
	createListAgentsTool,
	createSendMessageTool,
	createSpawnAgentTool,
	createWaitAgentTool,
	DISPATCH_WORKFLOWS_MAX_BATCH,
};

/** All root-side subagent control tools (never register on children). */
export function createSubagentControlTools(options: {
	getCoordinator: () => SubagentCoordinator | undefined;
}): AgentTool[] {
	return [
		createSpawnAgentTool(options),
		createDispatchWorkflowsTool(options),
		createWaitAgentTool(options),
		createListAgentsTool(options),
		createInterruptAgentTool(options),
		createSendMessageTool(options),
		createFollowupTaskTool(options),
	] as unknown as AgentTool[];
}

export const SUBAGENT_CONTROL_TOOL_NAMES = [
	"spawn_agent",
	"dispatch_workflows",
	"wait_agent",
	"list_agents",
	"interrupt_agent",
	"send_message",
	"followup_task",
] as const;
