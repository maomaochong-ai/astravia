import { type Static, Type } from "@sinclair/typebox";
import type { CodingAgentTool } from "../../session/tool-scope.js";
import { toolCallDescriptionSchema } from "../../tools/tool-call-description.js";
import type { SubagentCoordinator } from "../coordinator.js";
import { SUBAGENT_TYPE_WORKFLOW } from "../types.js";

const WORKFLOW_NO_WAIT_TEXT =
	"Not waiting: all pending children are workflows, which notify you automatically via <subagent_notification> as each finishes. " +
	"Blocking here would only freeze this conversation. End your turn now (or continue other work) and react to the notifications passively.";

const waitAgentSchema = Type.Object({
	description: toolCallDescriptionSchema,
	targets: Type.Optional(
		Type.Array(Type.String(), {
			description:
				"Child ids, task_names, or /root/<task_name> paths. Omit to wait on any undelivered/active child.",
		}),
	),
	timeout_ms: Type.Optional(
		Type.Number({
			description: "Wait timeout in ms (default 30000, clamp 1000..300000)",
		}),
	),
});

export type WaitAgentToolInput = Static<typeof waitAgentSchema>;

export function createWaitAgentTool(options: {
	getCoordinator: () => SubagentCoordinator | undefined;
}): CodingAgentTool<typeof waitAgentSchema> {
	return {
		name: "wait_agent",
		label: "wait_agent",
		scope_use: ["conversation", "project", "cli"],
		category: "agent-control",
		description:
			"Wait until one or more subagents reach a terminal state. Event-driven (no polling). Consumes the completion so a <subagent_notification> will not re-deliver the same result. " +
			"NEVER use this for workflow children: they push <subagent_notification> on completion — after dispatch_workflows, end your turn and receive results passively.",
		parameters: waitAgentSchema,
		execute: async (_toolCallId, input: WaitAgentToolInput) => {
			const coord = options.getCoordinator();
			if (!coord) throw new Error("Subagents are not enabled for this session.");

			// Deterministic guard: when everything still in flight is a workflow,
			// cap the wait at the 1s minimum — undelivered terminal results are
			// still claimed and returned, but the agent cannot park the turn here.
			const resolveTargets = () => {
				if (input.targets && input.targets.length > 0) {
					return input.targets.map((t) => coord.get(t)).filter((s) => s !== undefined);
				}
				return [...coord.list()];
			};
			const inFlight = resolveTargets().filter(
				(s) => s.status === "queued" || s.status === "pending" || s.status === "running",
			);
			const workflowOnlyWait = inFlight.length > 0 && inFlight.every((s) => s.agentType === SUBAGENT_TYPE_WORKFLOW);

			const result = await coord.wait({
				targets: input.targets,
				timeoutMs: workflowOnlyWait ? 1000 : input.timeout_ms,
			});
			if (workflowOnlyWait && result.timedOut && result.agents.length === 0) {
				return {
					content: [{ type: "text" as const, text: WORKFLOW_NO_WAIT_TEXT }],
					details: { timedOut: true, agents: [], workflowNoWait: true },
				};
			}
			if (result.agents.length === 0) {
				const text = result.timedOut
					? "wait_agent timed out with no terminal subagent results."
					: "No matching subagents to wait on.";
				return {
					content: [{ type: "text" as const, text }],
					details: { timedOut: result.timedOut, agents: [] },
				};
			}
			const lines = result.agents.map((a) => {
				const parts = [`id=${a.id}`, `path=${a.path}`, `type=${a.agentType}`, `status=${a.status}`];
				if (a.errorMessage) parts.push(`error=${a.errorMessage}`);
				if (a.finalText) parts.push(`\nsummary:\n${a.finalText}`);
				return parts.join(" ");
			});
			const text = [
				result.timedOut ? "wait_agent finished (timeout with partial results):" : "wait_agent results:",
				...lines,
			].join("\n\n");
			return {
				content: [{ type: "text" as const, text }],
				details: { timedOut: result.timedOut, agents: result.agents },
			};
		},
	};
}
