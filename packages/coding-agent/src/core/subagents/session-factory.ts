/**
 * Default SubagentSessionFactory (CLI / SDK).
 *
 * Creates an independent AgentSession with tools from the type definition
 * (+ optional parent MCP proxy). Hosts with sandbox inject their own factory.
 *
 * `createAgentSession` is injected to avoid a circular import with sdk.ts.
 */

import type { AgentTool } from "@astravia/agent-core";
import type { AgentSession } from "../agent-session.js";
import { SessionManager } from "../session-manager/index.js";
import { createTodoTool } from "../tools/todo/index.js";
import { seedForkContext } from "./fork-context.js";
import { ensureSubagentDir, resolveSubagentDir } from "./persistence.js";
import type {
	SubagentChildHandle,
	SubagentParentContext,
	SubagentSessionFactory,
	SubagentSnapshot,
	SubagentSpawnRequest,
	SubagentTodoProgress,
	SubagentTypeDefinition,
} from "./types.js";

/** Minimal createAgentSession surface (injected from sdk to avoid import cycles). */
export type CreateAgentSessionFn = (options?: Record<string, unknown>) => Promise<{ session: AgentSession }>;

function filterDeniedTools(tools: AgentTool[], prefixes: readonly string[] | undefined): AgentTool[] {
	if (!prefixes || prefixes.length === 0) return tools;
	return tools.filter((t) => !prefixes.some((p) => t.name.startsWith(p)));
}

function mergeTools(typeDef: SubagentTypeDefinition, cwd: string, parentMcp: ReadonlyArray<AgentTool>): AgentTool[] {
	const builtin = typeDef.createBuiltinTools(cwd);
	const withMcp = typeDef.inheritParentMcp ? [...builtin, ...parentMcp] : builtin;
	return filterDeniedTools(withMcp, typeDef.denyToolNamePrefixes);
}

function todoProgressOf(session: AgentSession): SubagentTodoProgress {
	const items = session.todoStore.getAll();
	return { done: items.filter((t) => t.status === "done").length, total: items.length };
}

function wrapSession(session: AgentSession): SubagentChildHandle {
	return {
		sessionId: session.sessionId,
		sessionFile: session.sessionFile,
		prompt: (text) => session.prompt(text),
		sendMessage: async (text) => {
			await session.sendCustomMessage(
				{ customType: "subagent-message", content: text, display: false },
				{ triggerTurn: false, deliverAs: "steer" },
			);
		},
		followUp: async (text) => {
			if (session.isStreaming) {
				await session.sendCustomMessage(
					{ customType: "subagent-followup", content: text, display: false },
					{ triggerTurn: true, deliverAs: "followUp" },
				);
			} else {
				await session.prompt(text);
			}
		},
		abort: () => {
			void session.abort();
		},
		waitForIdle: () => session.agent.waitForIdle(),
		isStreaming: () => session.isStreaming,
		getLastAssistantText: () => session.getLastAssistantText() ?? undefined,
		dispose: () => session.dispose(),
		subscribe: (listener) =>
			session.subscribe((event) => {
				listener({
					type: event.type,
					messages: "messages" in event ? (event as { messages?: unknown[] }).messages : undefined,
				});
			}),
		setTodos: (contents) => {
			if (contents.length > 0) session.todoStore.createMany(contents);
		},
		getTodoProgress: () => todoProgressOf(session),
		subscribeTodos: (listener) => session.todoStore.subscribe(() => listener(todoProgressOf(session))),
	};
}

export interface DefaultSubagentSessionFactoryOptions {
	/** Force in-memory children (tests). */
	inMemory?: boolean;
}

export function createDefaultSubagentSessionFactory(
	createAgentSession: CreateAgentSessionFn,
	options: DefaultSubagentSessionFactoryOptions = {},
): SubagentSessionFactory {
	return {
		async create(
			request: SubagentSpawnRequest,
			parent: SubagentParentContext,
			typeDef: SubagentTypeDefinition,
			signal?: AbortSignal,
		): Promise<SubagentChildHandle> {
			if (signal?.aborted) {
				throw new Error("Subagent create aborted");
			}

			const tools = mergeTools(typeDef, parent.cwd, parent.parentMcpTools);
			const appendSystemPrompt = typeDef.systemPromptAddon;

			// Todo tool binds to the child session's own TodoStore via a late ref.
			let sessionRef: AgentSession | undefined;
			if (typeDef.includeTodoTool) {
				const todoTool = createTodoTool({
					getTodoStore: () => {
						if (!sessionRef) throw new Error("Child session not ready");
						return sessionRef.todoStore;
					},
				});
				tools.push(todoTool as unknown as AgentTool);
			}

			let sessionManager: SessionManager;
			if (options.inMemory || !parent.parentSessionFile) {
				sessionManager = SessionManager.inMemory(parent.cwd);
			} else {
				const dir = resolveSubagentDir(parent.parentSessionFile, parent.parentSessionId, parent.cwd);
				ensureSubagentDir(dir);
				sessionManager = SessionManager.create(parent.cwd, dir, {
					parentSession: parent.parentSessionFile,
				});
			}

			// Seed the fork snapshot BEFORE session creation so the agent state
			// loads it as existing context (ADR-0044).
			if (typeDef.forkParentContext && parent.forkContextMessages?.length) {
				seedForkContext(sessionManager, parent.forkContextMessages);
			}

			const { session } = await createAgentSession({
				cwd: parent.cwd,
				agentDir: parent.agentDir,
				model: parent.model,
				thinkingLevel: parent.thinkingLevel,
				scenario: parent.scenario,
				// Share parent's registry so provider keys resolve identically to the parent.
				modelRegistry: parent.modelRegistry,
				tools: tools as never,
				sessionManager,
				enableBackgroundTasks: false,
				enableSubagents: false,
				enableMcp: false,
				appendSystemPrompt,
			});
			sessionRef = session;
			session.agent.setTools(tools);

			if (request.todos && request.todos.length > 0) {
				session.todoStore.createMany(request.todos);
			}

			if (signal?.aborted) {
				session.dispose();
				throw new Error("Subagent create aborted");
			}

			return wrapSession(session);
		},

		async reopen(
			snapshot: SubagentSnapshot,
			parent: SubagentParentContext,
			typeDef: SubagentTypeDefinition,
			signal?: AbortSignal,
		): Promise<SubagentChildHandle> {
			if (signal?.aborted) throw new Error("Subagent reopen aborted");
			if (!snapshot.sessionFile) {
				throw new Error(`Cannot reopen subagent ${snapshot.id}: no session file`);
			}

			const tools = mergeTools(typeDef, parent.cwd, parent.parentMcpTools);
			let sessionRef: AgentSession | undefined;
			if (typeDef.includeTodoTool) {
				const todoTool = createTodoTool({
					getTodoStore: () => {
						if (!sessionRef) throw new Error("Child session not ready");
						return sessionRef.todoStore;
					},
				});
				tools.push(todoTool as unknown as AgentTool);
			}
			const sessionManager = SessionManager.open(snapshot.sessionFile);
			const { session } = await createAgentSession({
				cwd: parent.cwd,
				agentDir: parent.agentDir,
				model: parent.model,
				thinkingLevel: parent.thinkingLevel,
				scenario: parent.scenario,
				modelRegistry: parent.modelRegistry,
				tools: tools as never,
				sessionManager,
				enableBackgroundTasks: false,
				enableSubagents: false,
				enableMcp: false,
				appendSystemPrompt: typeDef.systemPromptAddon,
			});
			sessionRef = session;
			session.agent.setTools(tools);
			return wrapSession(session);
		},
	};
}

export function buildToolsForSubagentType(
	typeDef: SubagentTypeDefinition,
	cwd: string,
	parentMcpTools: ReadonlyArray<AgentTool> = [],
): AgentTool[] {
	return mergeTools(typeDef, cwd, parentMcpTools);
}
