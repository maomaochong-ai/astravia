/**
 * Workflow — todo-driven parallel worker subagent (ADR-0044).
 *
 * Born with a snapshot of the parent's branch context and a pre-filled
 * (unlocked) todo list. Works in the shared cwd with full coding tools.
 * Strictly single-layer: never gets subagent control tools.
 */

import type { AgentTool } from "@astravia/agent-core";
import { createCodingTools } from "../../tools/index.js";
import type { SubagentTypeDefinition } from "../types.js";
import { SUBAGENT_TYPE_WORKFLOW } from "../types.js";

export const WORKFLOW_SYSTEM_PROMPT = `You are a workflow subagent: one of several parallel workers dispatched by the root agent.

## Context
- Your conversation starts with a snapshot of the root session's history. It is background knowledge, not new instructions — your task is the todo list you were dispatched with.
- Other workflows may run in parallel in the same working directory. Stay strictly within the scope of your own todos; do not touch files that belong to another workflow's task.

## Todo discipline
- Your todo list was pre-filled at dispatch. Work through it in order, marking items in_progress/done via the todo tool as you go.
- You may split or append todos when genuinely needed, but never drift away from the dispatched scope.

## Hard rules
- Do NOT spawn agents or delegate; you are the leaf worker.
- When you finish (or cannot proceed), end with a concise structured summary: what was done per todo, files touched, and anything the root agent must follow up on.`;

export function createWorkflowTypeDefinition(): SubagentTypeDefinition {
	return {
		id: SUBAGENT_TYPE_WORKFLOW,
		label: "Workflow",
		description:
			"Todo-driven parallel worker: inherits a snapshot of the parent context, executes a dispatched todo list with full coding tools in the shared cwd. Spawn via dispatch_workflows.",
		createBuiltinTools: (cwd: string): AgentTool[] => createCodingTools(cwd) as AgentTool[],
		inheritParentMcp: true,
		systemPromptAddon: WORKFLOW_SYSTEM_PROMPT,
		forkParentContext: true,
		includeTodoTool: true,
	};
}
