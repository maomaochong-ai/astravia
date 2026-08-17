/**
 * Explorer — first shipped subagent type.
 *
 * Persona: gather information only (repo structure, docs, local files, and —
 * when inheritParentMcp is true — parent MCP tools such as web search).
 * Must never edit the workspace; the root agent owns all mutations.
 *
 * Horizontal expansion: add `types/worker.ts` (etc.) and register on the same
 * registry; do not special-case explorer inside the coordinator.
 */

import type { AgentTool } from "@astravia/agent-core";
import { createReadOnlyTools } from "../../tools/index.js";
import type { SubagentTypeDefinition } from "../types.js";
import { SUBAGENT_TYPE_EXPLORER } from "../types.js";

export const EXPLORER_SYSTEM_PROMPT = `You are an explorer subagent. Your job is to gather information for the root agent.

## Role
- Investigate code structure, documentation, configuration, and related materials.
- Use web/search MCP tools when the parent session has them and external facts help.
- Return concise, evidence-backed findings the root agent can act on.

## Hard rules
- Do NOT modify files, create files, or run mutating shell commands. You only have read-oriented tools (plus any search MCP tools from the parent).
- Do NOT claim you changed the codebase. Final edits are always done by the root agent.
- Prefer absolute paths in findings. Cite file paths and, when relevant, URLs or MCP sources.
- If information is missing or tools fail, say so clearly instead of guessing.
- End with a short structured summary: key facts, open questions, suggested next steps for the root agent.`;

export function createExplorerTypeDefinition(): SubagentTypeDefinition {
	return {
		id: SUBAGENT_TYPE_EXPLORER,
		label: "Explorer",
		description:
			"Read-only information gathering: codebase recon, local docs, structure, and parent MCP search tools when available. Never writes files.",
		createBuiltinTools: (cwd: string): AgentTool[] => createReadOnlyTools(cwd) as AgentTool[],
		inheritParentMcp: true,
		systemPromptAddon: EXPLORER_SYSTEM_PROMPT,
	};
}
