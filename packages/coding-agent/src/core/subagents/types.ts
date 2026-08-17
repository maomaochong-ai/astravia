/**
 * Subagent public types and factory contracts.
 *
 * Agent *kinds* are not a closed union in product code: new types register via
 * {@link SubagentTypeRegistry}. Built-in ids (e.g. `"explorer"`) are constants
 * only; tools and the factory resolve behaviour through the registry.
 */

import type { AgentMessage, AgentTool, ThinkingLevel } from "@astravia/agent-core";
import type { Model } from "@astravia/ai";
import type { EcosystemHookRuntime } from "../hooks/index.js";
import type { ModelRegistry } from "../model-registry.js";
import type { ConversationScenario } from "../session/tool-scope.js";

/** Stable builtin type id for the read-only explorer (first shipped type). */
export const SUBAGENT_TYPE_EXPLORER = "explorer" as const;

/** Stable builtin type id for the todo-driven parallel workflow (ADR-0044). */
export const SUBAGENT_TYPE_WORKFLOW = "workflow" as const;

/**
 * Subagent type id. Built-ins use known string constants; custom types may use
 * any non-empty id registered on the session's {@link SubagentTypeRegistry}.
 */
export type SubagentTypeId = string;

/**
 * `queued`: accepted by dispatch but waiting for a concurrency slot (no child
 * session exists yet). `pending`: slot held, child session being created.
 */
export type SubagentStatus = "queued" | "pending" | "running" | "completed" | "failed" | "interrupted";

/** Todo progress mirrored from a child's TodoStore (display only; not a completion signal). */
export interface SubagentTodoProgress {
	done: number;
	total: number;
}

export interface SubagentUsageSnapshot {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	costTotal: number;
}

/** Serializable child state for tools, events, and desktop UI. */
export interface SubagentSnapshot {
	id: string;
	taskName: string;
	path: string;
	agentType: SubagentTypeId;
	status: SubagentStatus;
	task: string;
	parentSessionId: string;
	sessionFile?: string;
	startedAt: number;
	endedAt?: number;
	finalText?: string;
	errorMessage?: string;
	usage: SubagentUsageSnapshot;
	/** Monotonic completion generation for single-delivery notifications. */
	generation: number;
	/** Present when the child has a todo list (workflow children). */
	todoProgress?: SubagentTodoProgress;
	/** Human-readable one-line summary for UI display. */
	title?: string;
}

export interface SubagentSpawnRequest {
	taskName: string;
	message: string;
	agentType: SubagentTypeId;
	/** Pre-filled (unlocked) todo items for the child's own TodoStore. */
	todos?: string[];
	/** Human-readable one-line summary for UI display (task_name stays the id). */
	title?: string;
}

export interface SubagentParentContext {
	parentSessionId: string;
	parentSessionFile?: string;
	cwd: string;
	scenario: ConversationScenario;
	model: Model<any>;
	thinkingLevel: ThinkingLevel;
	agentDir?: string;
	/**
	 * Parent's live model registry (remote token + loaded remote models).
	 * Must be shared so children resolve provider keys identically to the parent.
	 */
	modelRegistry?: ModelRegistry;
	/** Live MCP tools from the parent session (proxy, not re-spawned). */
	parentMcpTools: ReadonlyArray<AgentTool>;
	/**
	 * One-shot snapshot of the parent's current-branch context to seed the child
	 * with (ADR-0044). Populated only for types with `forkParentContext`.
	 */
	forkContextMessages?: AgentMessage[];
}

/**
 * How a registered type assembles child tools and prompt policy.
 * Horizontal expansion = register another definition; coordinator stays generic.
 */
export interface SubagentTypeDefinition {
	/** Unique type id (e.g. `"explorer"`, future `"worker"`). */
	id: SubagentTypeId;
	/** Short label for UI / tool docs. */
	label: string;
	/** Longer description injected into spawn_agent tool docs. */
	description: string;
	/**
	 * Build the type's *builtin* tool set for a child cwd.
	 * Must not include subagent control tools (spawn/list/wait/…).
	 */
	createBuiltinTools: (cwd: string) => AgentTool[];
	/**
	 * When true, parent MCP tools are appended to the child tool surface
	 * (shared parent connections; no new MCP process).
	 */
	inheritParentMcp: boolean;
	/** Appended to the child system prompt (persona / constraints). */
	systemPromptAddon: string;
	/**
	 * Optional hard denylist of tool name prefixes after MCP merge
	 * (e.g. future worker-only filters). Default: none.
	 */
	denyToolNamePrefixes?: readonly string[];
	/** Seed the child with a snapshot of the parent's branch context (ADR-0044). */
	forkParentContext?: boolean;
	/** Give the child its own todo tool (bound to the child session's TodoStore). */
	includeTodoTool?: boolean;
}

/**
 * Creates a full child {@link import("../agent-session.js").AgentSession}.
 * Hosts (desktop RuntimeHost) inject sandbox-aware factories; CLI uses default.
 */
export interface SubagentSessionFactory {
	create(
		request: SubagentSpawnRequest,
		parent: SubagentParentContext,
		typeDef: SubagentTypeDefinition,
		signal?: AbortSignal,
	): Promise<SubagentChildHandle>;
	reopen?(
		snapshot: SubagentSnapshot,
		parent: SubagentParentContext,
		typeDef: SubagentTypeDefinition,
		signal?: AbortSignal,
	): Promise<SubagentChildHandle>;
}

/**
 * Minimal surface the coordinator needs on a live child session.
 * Avoids circular imports on the full AgentSession class.
 */
export interface SubagentChildHandle {
	sessionId: string;
	sessionFile?: string;
	prompt(text: string): Promise<void>;
	/** Queue message for next turn without starting a run (idle/running). */
	sendMessage(text: string): Promise<void>;
	/** Continue after terminal or during run (follow-up semantics). */
	followUp(text: string): Promise<void>;
	abort(): void;
	waitForIdle(): Promise<void>;
	isStreaming(): boolean;
	getLastAssistantText(): string | undefined;
	dispose(): void;
	subscribe(listener: (event: { type: string; messages?: unknown[] }) => void): () => void;
	/** Pre-fill the child's TodoStore (unlocked). Optional: only full sessions support it. */
	setTodos?(contents: string[]): void;
	getTodoProgress?(): SubagentTodoProgress;
	subscribeTodos?(listener: (progress: SubagentTodoProgress) => void): () => void;
}

export interface SubagentCoordinatorOptions {
	factory: SubagentSessionFactory;
	typeRegistry: SubagentTypeRegistryLike;
	parentSessionId: string;
	parentSessionFile?: string;
	cwd: string;
	scenario: ConversationScenario;
	getModel: () => Model<any> | undefined;
	getThinkingLevel: () => ThinkingLevel;
	/** Parent ModelRegistry so child sessions share remote auth / loaded models. */
	getModelRegistry?: () => ModelRegistry;
	getParentMcpTools: () => ReadonlyArray<AgentTool>;
	/** Parent branch context for fork-seeding (types with `forkParentContext`). */
	getParentContextMessages?: () => AgentMessage[];
	agentDir?: string;
	/** Default 3. Only pending/running count; queued children wait for a slot. */
	maxConcurrent?: number;
	/** Notify parent agent loop (completion delivery). */
	onNotify?: (payload: SubagentNotificationPayload) => void;
	/** Snapshot list changed (UI). */
	onUpdate?: (agents: ReadonlyArray<SubagentSnapshot>) => void;
	/**
	 * Optional ecosystem hooks for user-visible subagent lifecycle
	 * ({@link EcosystemHookRuntime.runSubagentStart} / {@link EcosystemHookRuntime.runSubagentStop}).
	 */
	hookRuntime?: EcosystemHookRuntime;
}

export interface SubagentNotificationPayload {
	agents: ReadonlyArray<SubagentSnapshot>;
	text: string;
}

/** Narrow registry surface for coordinator (testable without concrete class). */
export interface SubagentTypeRegistryLike {
	get(id: SubagentTypeId): SubagentTypeDefinition | undefined;
	list(): readonly SubagentTypeDefinition[];
	ids(): readonly SubagentTypeId[];
	describeForTools(): string;
}

export const TASK_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;

export function isValidTaskName(name: string): boolean {
	return name.length > 0 && name !== "root" && TASK_NAME_PATTERN.test(name);
}

export function taskPath(taskName: string): string {
	return `/root/${taskName}`;
}

export function emptyUsage(): SubagentUsageSnapshot {
	return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costTotal: 0 };
}

/** Max characters of finalText delivered via wait/notification (full text stays in transcript). */
export const SUBAGENT_FINAL_TEXT_LIMIT = 16 * 1024;

export function clipFinalText(text: string | undefined, limit = SUBAGENT_FINAL_TEXT_LIMIT): string | undefined {
	if (text === undefined) return undefined;
	if (text.length <= limit) return text;
	return `${text.slice(0, limit)}\n…[truncated ${text.length - limit} chars; see child transcript]`;
}
