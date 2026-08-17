/**
 * AgentSession - Core abstraction for agent lifecycle and session management.
 *
 * This class is shared between all run modes (interactive, print, rpc).
 * It encapsulates:
 * - Agent state access
 * - Event subscription with automatic session persistence
 * - Model and thinking level management
 * - Compaction (manual and auto)
 * - Bash execution
 * - Session switching and branching
 *
 * Modes use this class and add their own I/O layer on top.
 */

import { join } from "node:path";
import type { Agent, AgentMessage, AgentState, ThinkingLevel } from "@astravia/agent-core";
import type { ImageContent, Model, TextContent } from "@astravia/ai";
import { theme } from "../modes/interactive/theme/theme.js";
import { BackgroundTaskManager, buildTaskNotification } from "./background-tasks/index.js";
import type { BashResult } from "./bash-executor.js";
import type { CompactionResult } from "./compaction/index.js";
import { exportSessionToHtml, type ToolHtmlRenderer } from "./export-html/index.js";
import { createToolHtmlRenderer } from "./export-html/tool-renderer.js";
import type { ContextUsage, ExtensionRunner, ToolDefinition, ToolInfo } from "./extensions/index.js";
import { createEcosystemHookRuntime, type EcosystemHookRuntime } from "./hooks/index.js";
import type { McpManager } from "./mcp/index.js";
import { DEFAULT_MEMORY_CHAR_LIMIT, readMemoryContent } from "./memory/memory-store.js";
import type { CustomMessage } from "./messages.js";
import type { ModelRegistry } from "./model-registry.js";
import type { PromptTemplate } from "./prompt-templates.js";
import type { ResourceLoader } from "./resource-loader.js";
import { BashController } from "./session/bash-controller.js";
import { CompactionController } from "./session/compaction-controller.js";
import { EPHEMERAL_PREFIX, EventRouter } from "./session/event-router.js";
import { InputPipeline } from "./session/input-pipeline.js";
import { ModelController, type ModelCycleResult } from "./session/model-controller.js";
import { QueueController } from "./session/queue-controller.js";
import { RetryController } from "./session/retry-controller.js";
import { RuntimeManager } from "./session/runtime-manager.js";
import type { SessionContext } from "./session/session-context.js";
import { SessionNavigator } from "./session/session-navigator.js";
import {
	computeContextUsage,
	computeSessionStats,
	getLastAssistantText as readLastAssistantText,
	type SessionStats,
} from "./session/session-stats.js";
import { type ParsedSkillBlock, parseSkillBlock } from "./session/skill-expansion.js";
import { restoreTodoFromSession } from "./session/todo-continuation.js";
import type {
	AgentSessionConfig,
	AgentSessionEvent,
	AgentSessionEventListener,
	ExtensionBindings,
	PromptOptions,
	PromptResourceRef,
} from "./session/types.js";
import type { BranchSummaryEntry, SessionManager } from "./session-manager/index.js";
import type { SettingsManager } from "./settings-manager.js";
import { createDefaultSubagentTypeRegistry, SubagentCoordinator, type SubagentSnapshot } from "./subagents/index.js";
import type { AgentPluginRuntimeConfig } from "./system-prompt.js";
import { TODO_SNAPSHOT_TYPE, TodoStore } from "./todo-store.js";
import type { BashOperations } from "./tools/bash/index.js";

// ============================================================================
// Skill Block Parsing
// ============================================================================

// parseSkillBlock / ParsedSkillBlock moved to ./session/skill-expansion.ts.
// Re-exported here to preserve the existing import path for external consumers.
export { type ParsedSkillBlock, parseSkillBlock };
export type {
	AgentSessionConfig,
	AgentSessionEvent,
	AgentSessionEventListener,
	ExtensionBindings,
	ModelCycleResult,
	PromptOptions,
	PromptResourceRef,
	SessionStats,
};

// Types (AgentSessionConfig/Event/PromptOptions/…), ModelCycleResult, and SessionStats
// were moved to ./session/*; all are re-exported above to preserve import paths.

// ============================================================================
// AgentSession Class
// ============================================================================

export class AgentSession {
	readonly agent: Agent;
	readonly sessionManager: SessionManager;
	readonly settingsManager: SettingsManager;

	// Model + thinking level. Scoped-model state owned by the controller.
	private _model: ModelController;

	// Event subscription state
	private _unsubscribeAgent?: () => void;
	private _eventListeners: AgentSessionEventListener[] = [];

	// Steering / follow-up / next-turn queues. State owned by the controller.
	private _queue: QueueController;

	// Compaction (manual + auto). State owned by the controller.
	private _compaction: CompactionController;
	/** Shared context handed to sub-controllers. */
	private _ctx: SessionContext;

	// Session navigation (new/switch/fork/tree + branch summary). State in the controller.
	private _nav: SessionNavigator;

	// Agent event routing (dequeue / persistence / extension fan-out / retry + compaction dispatch).
	private _events: EventRouter;

	// Retry (auto-retry with backoff). State owned by the controller.
	private _retry: RetryController;

	// Bash execution. State owned by the controller.
	private _bash: BashController;

	// Subagent coordinator (optional, root sessions only).
	private _subagents?: SubagentCoordinator;

	// Tool runtime + extension lifecycle + MCP. State owned by the manager.
	private _runtime: RuntimeManager;

	// Input/turn pipeline (prompt / steer / follow-up / send + todo continuation).
	private _input: InputPipeline;

	private _resourceLoader: ResourceLoader;
	// memory-mode (ADR-0009)
	private _memoryMode: boolean = false;
	private _memoryFile: string | undefined;
	private _memoryCharLimit: number = DEFAULT_MEMORY_CHAR_LIMIT;
	/** Frozen MEMORY.md snapshot captured at session start; injected into the
	 * system prompt and never re-read mid-session (preserves the prompt cache). */
	private _memorySnapshot: string = "";
	private _cwd: string;

	// Model registry for API key resolution
	private _modelRegistry: ModelRegistry;

	// Todo list
	private _todoStore: TodoStore;

	// Background bash tasks (run_in_background)
	private _backgroundTasks: BackgroundTaskManager;
	private _hookRuntime: EcosystemHookRuntime;

	constructor(config: AgentSessionConfig) {
		this.agent = config.agent;
		this.sessionManager = config.sessionManager;
		this.settingsManager = config.settingsManager;
		this._resourceLoader = config.resourceLoader;
		this._cwd = config.cwd;
		this._modelRegistry = config.modelRegistry;
		this._hookRuntime = createEcosystemHookRuntime({
			host: {
				cwd: this._cwd,
				getSessionId: () => this.sessionManager.getSessionId(),
				getTranscriptPath: () => this.sessionManager.getSessionFile() ?? null,
				getModelId: () => this.model?.id ?? this.agent.state.model?.id ?? "unknown",
				abortCurrentRun: () => this.agent.abort(),
				recordAdditionalContexts: (contexts) => {
					for (const content of contexts) {
						const message: CustomMessage = {
							role: "custom",
							customType: "ecosystem-hook-context",
							content,
							display: false,
							timestamp: Date.now(),
						};
						this.agent.appendMessage(message);
						this.sessionManager.appendMessage(message);
					}
				},
			},
			initialSessionStartSource: this.sessionManager.getEntries().length > 0 ? "resume" : "startup",
			additionalAdapterFactories: config.additionalHookAdapterFactories,
			configLayers: config.hookConfigLayers,
		});

		// memory-mode: capture the frozen MEMORY.md snapshot once, here at
		// construction. im-gateway spawns a fresh process per message burst, so
		// "once at construction" ≈ once per inbound message — memory edits land
		// in the next message's prompt without busting the in-process cache.
		this._memoryMode = config.memoryMode ?? false;
		this._memoryFile = config.memoryFile ?? (this._memoryMode ? join(this._cwd, "MEMORY.md") : undefined);
		this._memoryCharLimit = config.memoryCharLimit ?? DEFAULT_MEMORY_CHAR_LIMIT;
		if (this._memoryMode && this._memoryFile) {
			this._memorySnapshot = readMemoryContent(this._memoryFile);
		}

		// Shared context for sub-controllers. model / extensionRunner are accessors
		// so controllers always read the current (mutable) values.
		const session = this;
		this._ctx = {
			agent: this.agent,
			sessionManager: this.sessionManager,
			settingsManager: this.settingsManager,
			modelRegistry: this._modelRegistry,
			cwd: this._cwd,
			hookRuntime: this._hookRuntime,
			get model() {
				return session.model;
			},
			get extensionRunner() {
				return session._runtime?.extensionRunner;
			},
			get memoryMode() {
				return session._memoryMode;
			},
			get memoryFile() {
				return session._memoryFile;
			},
			get memoryCharLimit() {
				return session._memoryCharLimit;
			},
			get memorySnapshot() {
				return session._memorySnapshot;
			},
			emit: (event) => session._emit(event),
			abort: () => session.abort(),
			disconnectFromAgent: () => session._disconnectFromAgent(),
			reconnectToAgent: () => session._reconnectToAgent(),
		};
		this._compaction = new CompactionController(this._ctx);
		this._retry = new RetryController(this._ctx);
		this._bash = new BashController(this._ctx);
		this._model = new ModelController(this._ctx, config.scopedModels ?? []);
		this._queue = new QueueController(this._ctx);
		this._nav = new SessionNavigator(this._ctx, this._queue, this._model);

		// Initialize TodoStore with session persistence
		this._todoStore = new TodoStore((snapshot) => {
			this.sessionManager.appendCustomEntry(TODO_SNAPSHOT_TYPE, snapshot);
			this._emit({ type: "todo_update", items: snapshot.items });
		});

		// Restore todo state from session if resuming
		restoreTodoFromSession(this.sessionManager, this._todoStore);

		this._events = new EventRouter(this._ctx, {
			todoStore: this._todoStore,
			queue: this._queue,
			retry: this._retry,
			compaction: this._compaction,
		});

		this._backgroundTasks = new BackgroundTaskManager();

		if (config.enableSubagents && config.subagentSessionFactory) {
			const typeRegistry = config.subagentTypeRegistry ?? createDefaultSubagentTypeRegistry();
			this._subagents = new SubagentCoordinator({
				factory: config.subagentSessionFactory,
				typeRegistry,
				parentSessionId: this.sessionManager.getSessionId(),
				parentSessionFile: this.sessionManager.getSessionFile(),
				cwd: config.cwd,
				scenario: config.scenario ?? "cli",
				getModel: () => this.model,
				getThinkingLevel: () => this.thinkingLevel,
				getModelRegistry: () => this._modelRegistry,
				getParentMcpTools: () => this._runtime?.mcpManager?.getTools() ?? [],
				// Fork snapshot for workflow children (ADR-0044): the parent's live
				// message state, which already reflects the current branch.
				getParentContextMessages: () => [...this.agent.state.messages],
				agentDir: undefined,
				maxConcurrent: config.subagentMaxConcurrent,
				hookRuntime: this._hookRuntime,
				onUpdate: (agents) => {
					this._emit({ type: "subagents_update", agents });
				},
				onNotify: (payload) => {
					void this.sendCustomMessage(
						{ customType: "subagent-notification", content: payload.text, display: true },
						{ triggerTurn: true, deliverAs: "followUp" },
					).catch((err) => {
						console.error("[Subagents] Failed to deliver subagent notification:", err);
					});
				},
			});
		}

		this._runtime = new RuntimeManager(this._ctx, this, {
			resourceLoader: this._resourceLoader,
			todoStore: this._todoStore,
			backgroundTasks: this._backgroundTasks,
			enableBackgroundTasks: config.enableBackgroundTasks !== false,
			getSubagentCoordinator: () => this._subagents,
			customTools: config.customTools ?? [],
			baseToolsOverride: config.baseToolsOverride,
			envOverlay: config.envOverlay,
			scenario: config.scenario,
			agentMode: config.agentMode,
			initialActiveToolNames: config.initialActiveToolNames,
			extensionRunnerRef: config.extensionRunnerRef,
			enableMcp: config.enableMcp !== undefined ? config.enableMcp : true,
			mcpDebug: config.mcpDebug || false,
			askUserQuestion: config.askUserQuestion,
			agentPlugins: config.agentPlugins,
			invokePluginTool: config.invokePluginTool,
			invokePluginContinuation: config.invokePluginContinuation,
			invokePluginSystemPrompt: config.invokePluginSystemPrompt,
		});

		this._input = new InputPipeline(this._ctx, {
			runtime: this._runtime,
			queue: this._queue,
			bash: this._bash,
			retry: this._retry,
			compaction: this._compaction,
			todoStore: this._todoStore,
			resourceLoader: this._resourceLoader,
		});

		// Initialize MCP manager (async; rebuilds runtime when servers are ready).
		this._runtime.initMcp();

		// Always subscribe to agent events for internal handling
		// (session persistence, extensions, auto-compaction, retry logic)
		this._unsubscribeAgent = this.agent.subscribe((event) => {
			if (event.type === "agent_start") {
				this._runtime.resetPluginContinuationRun();
			}
			this._events.handle(event);
		});

		// Build runtime initially (will be rebuilt after MCP initialization if MCP is enabled)
		this._runtime.buildRuntime({
			activeToolNames: config.initialActiveToolNames,
			includeAllExtensionTools: true,
		});

		// Register the continuation policy for todo continuation.
		// This runs INSIDE the agent loop (before follow-up queue is consumed),
		// ensuring the agent cannot exit the loop while todo items remain.
		this.agent.continuationProvider = async (signal) => {
			const todoMessages = this._input.buildTodoContinuationMessages();
			if (todoMessages.length > 0) return todoMessages;
			const pluginMessages = await this._runtime.collectPluginContinuationMessages(signal);
			if (pluginMessages.length > 0) return pluginMessages;
			const fragments = await this._hookRuntime.runStop(
				readLastAssistantText(this.agent.state.messages) ?? null,
				signal,
			);
			return fragments.map((text) => ({
				role: "user" as const,
				content: [{ type: "text" as const, text }],
				timestamp: Date.now(),
			}));
		};

		// Background task wiring: forward state changes to session listeners (UI),
		// and inject a <task-notification> back into the agent loop on completion.
		// While streaming the notification queues as a follow-up (processed after
		// the current turn); when idle it triggers a new turn (wakes the agent).
		this._backgroundTasks.subscribe(() => {
			this._emit({ type: "background_tasks_update", tasks: this._backgroundTasks.list() });
		});
		this._backgroundTasks.onNotify = (task) => {
			void this.sendCustomMessage(
				{ customType: "task-notification", content: buildTaskNotification(task), display: true },
				{ triggerTurn: true, deliverAs: "followUp" },
			).catch((err) => {
				console.error(`[BackgroundTasks] Failed to deliver task notification for ${task.id}:`, err);
			});
		};
	}

	/** Model registry for API key resolution and model discovery */
	get modelRegistry(): ModelRegistry {
		return this._modelRegistry;
	}

	/** Subagent coordinator when enableSubagents is on; undefined otherwise. */
	get subagents(): SubagentCoordinator | undefined {
		return this._subagents;
	}

	/** Snapshot list of child subagents (empty when disabled). */
	listSubagents(): ReadonlyArray<SubagentSnapshot> {
		return this._subagents?.list() ?? [];
	}

	/** Interrupt a child by id / task_name / path (UI / host control). */
	interruptSubagent(target: string): SubagentSnapshot | undefined {
		return this._subagents?.interrupt(target);
	}

	/**
	 * Drop terminal subagents from the live registry (UI "clear finished").
	 * Does not delete child transcript files on disk.
	 */
	clearFinishedSubagents(): number {
		return this._subagents?.clearFinished() ?? 0;
	}

	/** MCP manager for managing MCP servers and tools */
	get mcpManager(): McpManager | undefined {
		return this._runtime.mcpManager;
	}

	// =========================================================================
	// Event Subscription
	// =========================================================================

	/** Emit an event to all listeners */
	private _emit(event: AgentSessionEvent): void {
		for (const l of this._eventListeners) {
			l(event);
		}
	}

	/** @deprecated kept for compatibility; see event-router EPHEMERAL_PREFIX. */
	static readonly EPHEMERAL_PREFIX = EPHEMERAL_PREFIX;

	/**
	 * Subscribe to agent events.
	 * Session persistence is handled internally (saves messages on message_end).
	 * Multiple listeners can be added. Returns unsubscribe function for this listener.
	 */
	subscribe(listener: AgentSessionEventListener): () => void {
		this._eventListeners.push(listener);

		// Return unsubscribe function for this specific listener
		return () => {
			const index = this._eventListeners.indexOf(listener);
			if (index !== -1) {
				this._eventListeners.splice(index, 1);
			}
		};
	}

	/**
	 * Temporarily disconnect from agent events.
	 * User listeners are preserved and will receive events again after resubscribe().
	 * Used internally during operations that need to pause event processing.
	 */
	private _disconnectFromAgent(): void {
		if (this._unsubscribeAgent) {
			this._unsubscribeAgent();
			this._unsubscribeAgent = undefined;
		}
	}

	/**
	 * Reconnect to agent events after _disconnectFromAgent().
	 * Preserves all existing listeners.
	 */
	private _reconnectToAgent(): void {
		if (this._unsubscribeAgent) return; // Already connected
		this._unsubscribeAgent = this.agent.subscribe((event) => {
			if (event.type === "agent_start") {
				this._runtime.resetPluginContinuationRun();
			}
			this._events.handle(event);
		});
	}

	/**
	 * Remove all listeners and disconnect from agent.
	 * Call this when completely done with the session.
	 *
	 * Releases the session file lock so another process can take ownership.
	 * After dispose(), the underlying SessionManager must not be reused.
	 */
	dispose(): void {
		this._disconnectFromAgent();
		this._eventListeners = [];

		// Best-effort SessionEnd before tearing down session resources.
		// baseEvent() is captured synchronously; do not await (dispose stays sync).
		void this._hookRuntime.runSessionEnd("dispose").catch((error) => {
			console.warn("[ecosystem-hooks] SessionEnd on dispose failed", error);
		});

		// Tear down children first so they cannot notify a disposed parent.
		void this._subagents?.dispose();
		this._subagents = undefined;

		// Kill any still-running background tasks (lifecycle bound to the session).
		this._backgroundTasks.killAll();

		// Release the session file lock so another writer can take over.
		this.sessionManager.close();

		// Shutdown MCP servers
		this._runtime.shutdown();
	}

	// =========================================================================
	// Read-only State Access
	// =========================================================================

	/** Full agent state */
	get state(): AgentState {
		return this.agent.state;
	}

	/** Current model (may be undefined if not yet selected) */
	get model(): Model<any> | undefined {
		return this.agent.state.model;
	}

	/** Current thinking level */
	get thinkingLevel(): ThinkingLevel {
		return this.agent.state.thinkingLevel;
	}

	/** Whether agent is currently streaming a response */
	get isStreaming(): boolean {
		return this.agent.state.isStreaming;
	}

	/** Current effective system prompt (includes any per-turn extension modifications) */
	get systemPrompt(): string {
		return this.agent.state.systemPrompt;
	}

	/** Current retry attempt (0 if not retrying) */
	get retryAttempt(): number {
		return this._retry.retryAttempt;
	}

	/** Names of currently active tools. */
	getActiveToolNames(): string[] {
		return this._runtime.getActiveToolNames();
	}

	/** All configured tools with name, description, and parameter schema. */
	getAllTools(): ToolInfo[] {
		return this._runtime.getAllTools();
	}

	/** Set active tools by name (unknown names ignored); rebuilds the system prompt. */
	setActiveToolsByName(toolNames: string[]): void {
		this._runtime.setActiveToolsByName(toolNames);
	}

	/** Reconfigure SDK custom tools and rebuild runtime. */
	reconfigureCustomTools(customTools: ToolDefinition[] | undefined): void {
		this._runtime.reconfigureCustomTools(customTools);
	}

	/** Reconfigure plugin-provided runtime resources and rebuild tools/system prompt. */
	async reconfigureAgentPlugins(agentPlugins: AgentPluginRuntimeConfig | undefined): Promise<void> {
		await this._runtime.reconfigureAgentPlugins(agentPlugins);
	}

	/** 当前工作模式（agent_mode 轴）。 */
	get agentMode(): string | undefined {
		return this._runtime.agentMode;
	}

	/** 切换工作模式并重建 runtime（工具集 + 系统提示词）。调用方须在 turn 边界调用。见 ADR-0046。 */
	setAgentMode(mode: string | undefined): void {
		this._runtime.setAgentMode(mode);
	}

	async prepareSystemPromptForAgentRun(messages: AgentMessage[], signal?: AbortSignal): Promise<string> {
		return this._runtime.prepareSystemPromptForAgentRun(messages, signal);
	}

	/** Whether auto-compaction is currently running */
	get isCompacting(): boolean {
		return this._compaction.isCompacting;
	}

	/** All messages including custom types like BashExecutionMessage */
	get messages(): AgentMessage[] {
		return this.agent.state.messages;
	}

	/** Current steering mode */
	get steeringMode(): "all" | "one-at-a-time" {
		return this.agent.getSteeringMode();
	}

	/** Current follow-up mode */
	get followUpMode(): "all" | "one-at-a-time" {
		return this.agent.getFollowUpMode();
	}

	/** Current session file path, or undefined if sessions are disabled */
	get sessionFile(): string | undefined {
		return this.sessionManager.getSessionFile();
	}

	/** Current session ID */
	get sessionId(): string {
		return this.sessionManager.getSessionId();
	}

	/** Current session display name, if set */
	get sessionName(): string | undefined {
		return this.sessionManager.getSessionName();
	}

	/** Full branch entries from root to current leaf (for UI history display). */
	getSessionBranch(): import("./session-manager/index.js").SessionEntry[] {
		return this.sessionManager.getBranch();
	}

	/** Scoped models for cycling (from --models flag) */
	get scopedModels(): ReadonlyArray<{ model: Model<any>; thinkingLevel: ThinkingLevel }> {
		return this._model.scopedModels;
	}

	/** Update scoped models for cycling */
	setScopedModels(scopedModels: Array<{ model: Model<any>; thinkingLevel: ThinkingLevel }>): void {
		this._model.setScopedModels(scopedModels);
	}

	/** File-based prompt templates */
	get promptTemplates(): ReadonlyArray<PromptTemplate> {
		return this._resourceLoader.getPrompts().prompts;
	}

	/** Todo store for task planning and tracking */
	get todoStore(): TodoStore {
		return this._todoStore;
	}

	/** Background bash task manager (run_in_background) */
	get backgroundTasks(): BackgroundTaskManager {
		return this._backgroundTasks;
	}

	/** memory-mode enabled? (ADR-0009) */
	get memoryMode(): boolean {
		return this._memoryMode;
	}

	/** Absolute MEMORY.md path, or undefined when memory-mode is off. */
	get memoryFile(): string | undefined {
		return this._memoryFile;
	}

	/** MEMORY.md character budget. */
	get memoryCharLimit(): number {
		return this._memoryCharLimit;
	}

	// =========================================================================
	// Prompting
	// =========================================================================

	/**
	 * Send a prompt to the agent. Handles extension commands, expands templates,
	 * queues during streaming, validates model/API key, and drives the turn.
	 */
	async prompt(text: string, options?: PromptOptions): Promise<void> {
		return this._input.prompt(text, options);
	}

	/**
	 * Queue a steering message to interrupt the agent mid-run.
	 * @throws Error if text is an extension command
	 */
	async steer(text: string, images?: ImageContent[]): Promise<void> {
		return this._input.steer(text, images);
	}

	/**
	 * Queue a follow-up message to be processed after the agent finishes.
	 * @throws Error if text is an extension command
	 */
	async followUp(text: string, images?: ImageContent[]): Promise<void> {
		return this._input.followUp(text, images);
	}

	/** Send a custom message to the session (streaming-aware; optional turn trigger). */
	async sendCustomMessage<T = unknown>(
		message: Pick<CustomMessage<T>, "customType" | "content" | "display" | "details">,
		options?: { triggerTurn?: boolean; deliverAs?: "steer" | "followUp" | "nextTurn" },
	): Promise<void> {
		return this._input.sendCustomMessage(message, options);
	}

	/** Send a user message to the agent. Always triggers a turn. */
	async sendUserMessage(
		content: string | (TextContent | ImageContent)[],
		options?: { deliverAs?: "steer" | "followUp" },
	): Promise<void> {
		return this._input.sendUserMessage(content, options);
	}

	/**
	 * Clear all queued messages and return them.
	 * Useful for restoring to editor when user aborts.
	 * @returns Object with steering and followUp arrays
	 */
	clearQueue(): { steering: string[]; followUp: string[] } {
		return this._queue.clear();
	}

	/** Number of pending messages (includes both steering and follow-up) */
	get pendingMessageCount(): number {
		return this._queue.pendingCount;
	}

	/** Get pending steering messages (read-only) */
	getSteeringMessages(): readonly string[] {
		return this._queue.steeringMessages;
	}

	/** Get pending follow-up messages (read-only) */
	getFollowUpMessages(): readonly string[] {
		return this._queue.followUpMessages;
	}

	get resourceLoader(): ResourceLoader {
		return this._resourceLoader;
	}

	/**
	 * Abort current operation and wait for agent to become idle.
	 */
	async abort(): Promise<void> {
		this.abortRetry();
		this.agent.abort();
		await this.agent.waitForIdle();
	}

	/** Start a new session (optionally branched from a parent). */
	async newSession(options?: {
		parentSession?: string;
		setup?: (sessionManager: SessionManager) => Promise<void>;
	}): Promise<boolean> {
		return this._nav.newSession(options);
	}

	// =========================================================================
	// Model Management
	// =========================================================================

	/**
	 * Set model directly. Validates API key, saves to session and settings.
	 * @throws Error if no API key available for the model
	 */
	async setModel(model: Model<any>): Promise<void> {
		return this._model.setModel(model);
	}

	/**
	 * Cycle to next/previous model (scoped models if --models was set, else all available).
	 */
	async cycleModel(direction: "forward" | "backward" = "forward"): Promise<ModelCycleResult | undefined> {
		return this._model.cycleModel(direction);
	}

	// =========================================================================
	// Thinking Level Management
	// =========================================================================

	/** Set thinking level (clamped to current model capabilities). */
	setThinkingLevel(level: ThinkingLevel): void {
		this._model.setThinkingLevel(level);
	}

	/** Cycle to next thinking level. Returns undefined if the model doesn't support thinking. */
	cycleThinkingLevel(): ThinkingLevel | undefined {
		return this._model.cycleThinkingLevel();
	}

	/** Get available thinking levels for the current model. */
	getAvailableThinkingLevels(): ThinkingLevel[] {
		return this._model.getAvailableThinkingLevels();
	}

	/** Check if current model supports xhigh thinking level. */
	supportsXhighThinking(): boolean {
		return this._model.supportsXhighThinking();
	}

	/** Check if current model supports thinking/reasoning. */
	supportsThinking(): boolean {
		return this._model.supportsThinking();
	}

	// =========================================================================
	// Queue Mode Management
	// =========================================================================

	/**
	 * Set steering message mode.
	 * Saves to settings.
	 */
	setSteeringMode(mode: "all" | "one-at-a-time"): void {
		this.agent.setSteeringMode(mode);
		this.settingsManager.setSteeringMode(mode);
	}

	/**
	 * Set follow-up message mode.
	 * Saves to settings.
	 */
	setFollowUpMode(mode: "all" | "one-at-a-time"): void {
		this.agent.setFollowUpMode(mode);
		this.settingsManager.setFollowUpMode(mode);
	}

	// =========================================================================
	// Compaction
	// =========================================================================

	/**
	 * Manually compact the session context.
	 * Aborts current agent operation first.
	 * @param customInstructions Optional instructions for the compaction summary
	 */
	async compact(customInstructions?: string): Promise<CompactionResult> {
		return this._compaction.compact(customInstructions);
	}

	/**
	 * Cancel in-progress compaction (manual or auto).
	 */
	abortCompaction(): void {
		this._compaction.abort();
	}

	/** Cancel in-progress branch summarization. */
	abortBranchSummary(): void {
		this._nav.abortBranchSummary();
	}

	/**
	 * Consolidate durable facts from the CURRENT context into MEMORY.md on demand
	 * (ADR-0009). Unlike the automatic flush that runs before a rollover, this is
	 * an explicit consolidation point — the host calls it before discarding the
	 * session (e.g. the user's `/new`), so a short session that never hit the
	 * rollover threshold still gets its memory凝结. memory-mode only; best-effort;
	 * returns the number of entries written.
	 */
	async flushMemory(): Promise<number> {
		return this._compaction.flushMemory();
	}

	/**
	 * Pre-LLM-call compaction. Called from transformContext before each LLM call.
	 */
	async preCallCompaction(messages: AgentMessage[], signal?: AbortSignal): Promise<AgentMessage[]> {
		return this._compaction.preCallCompaction(messages, signal);
	}

	/**
	 * Toggle auto-compaction setting.
	 */
	setAutoCompactionEnabled(enabled: boolean): void {
		this.settingsManager.setCompactionEnabled(enabled);
	}

	/** Whether auto-compaction is enabled */
	get autoCompactionEnabled(): boolean {
		return this.settingsManager.getCompactionEnabled();
	}

	async bindExtensions(bindings: ExtensionBindings): Promise<void> {
		return this._runtime.bindExtensions(bindings);
	}

	/** Reload MCP servers from disk and rebuild the runtime. */
	async reloadMcp(): Promise<void> {
		return this._runtime.reloadMcp();
	}

	/** Reload settings, resources, and extensions, then rebuild the runtime. */
	async reload(): Promise<void> {
		return this._runtime.reload();
	}

	// =========================================================================
	// Auto-Retry
	// =========================================================================

	/** Cancel in-progress retry. */
	abortRetry(): void {
		this._retry.abortRetry();
	}

	/** Whether auto-retry is currently in progress */
	get isRetrying(): boolean {
		return this._retry.isRetrying;
	}

	/** Whether auto-retry is enabled */
	get autoRetryEnabled(): boolean {
		return this.settingsManager.getRetryEnabled();
	}

	/**
	 * Toggle auto-retry setting.
	 */
	setAutoRetryEnabled(enabled: boolean): void {
		this.settingsManager.setRetryEnabled(enabled);
	}

	// =========================================================================
	// Bash Execution
	// =========================================================================

	/**
	 * Execute a bash command. Adds result to agent context and session.
	 */
	async executeBash(
		command: string,
		onChunk?: (chunk: string) => void,
		options?: { excludeFromContext?: boolean; operations?: BashOperations },
	): Promise<BashResult> {
		return this._bash.executeBash(command, onChunk, options);
	}

	/**
	 * Record a bash execution result in session history.
	 * Used by executeBash and by extensions that handle bash execution themselves.
	 */
	recordBashResult(command: string, result: BashResult, options?: { excludeFromContext?: boolean }): void {
		this._bash.recordBashResult(command, result, options);
	}

	/** Cancel running bash command. */
	abortBash(): void {
		this._bash.abortBash();
	}

	/** Whether a bash command is currently running */
	get isBashRunning(): boolean {
		return this._bash.isBashRunning;
	}

	/** Whether there are pending bash messages waiting to be flushed */
	get hasPendingBashMessages(): boolean {
		return this._bash.hasPendingBashMessages;
	}

	// =========================================================================
	// Session Management
	// =========================================================================

	/**
	 * Switch to a different session file. Aborts current operation, loads
	 * messages, restores model/thinking. Returns false if cancelled by extension.
	 */
	async switchSession(sessionPath: string): Promise<boolean> {
		return this._nav.switchSession(sessionPath);
	}

	/**
	 * Set a display name for the current session.
	 */
	setSessionName(name: string): void {
		this.sessionManager.appendSessionInfo(name);
	}

	/**
	 * Create a fork from a specific entry.
	 * @returns selectedText (for editor pre-fill) and cancelled (true if an extension cancelled).
	 */
	async fork(entryId: string): Promise<{ selectedText: string; cancelled: boolean }> {
		return this._nav.fork(entryId);
	}

	// =========================================================================
	// Tree Navigation
	// =========================================================================

	/** Navigate to a different node in the session tree (stays in the same file). */
	async navigateTree(
		targetId: string,
		options: { summarize?: boolean; customInstructions?: string; replaceInstructions?: boolean; label?: string } = {},
	): Promise<{ editorText?: string; cancelled: boolean; aborted?: boolean; summaryEntry?: BranchSummaryEntry }> {
		return this._nav.navigateTree(targetId, options);
	}

	/**
	 * Switch to another branch tip under the same session file (view sibling paths).
	 * Does not put text in the editor.
	 */
	switchBranch(targetId: string): { leafId: string } {
		return this._nav.switchBranch(targetId);
	}

	/** Permanently delete one message while preserving and reparenting its descendants. */
	deleteMessage(entryId: string): { leafId: string | null } {
		const result = this.sessionManager.deleteMessage(entryId);
		this.agent.replaceMessages(this.sessionManager.buildSessionContext().messages);
		return result;
	}

	/**
	 * Export a fork as a new session file without leaving the current session.
	 * History is copied up to the parent of the selected user message.
	 */
	exportForkToNewFile(entryId: string): { path: string; text: string } {
		return this._nav.exportForkToNewFile(entryId);
	}

	/** Get all user messages from session for fork selector. */
	getUserMessagesForForking(): Array<{ entryId: string; text: string }> {
		return this._nav.getUserMessagesForForking();
	}

	/**
	 * Get session statistics.
	 */
	getSessionStats(): SessionStats {
		return computeSessionStats({
			messages: this.state.messages,
			sessionFile: this.sessionFile,
			sessionId: this.sessionId,
		});
	}

	getContextUsage(): ContextUsage | undefined {
		return computeContextUsage({
			model: this.model,
			messages: this.messages,
			sessionManager: this.sessionManager,
		});
	}

	/**
	 * Export session to HTML.
	 * @param outputPath Optional output path (defaults to session directory)
	 * @returns Path to exported file
	 */
	async exportToHtml(outputPath?: string): Promise<string> {
		const themeName = this.settingsManager.getTheme();

		// Create tool renderer if we have an extension runner (for custom tool HTML rendering)
		let toolRenderer: ToolHtmlRenderer | undefined;
		const exportRunner = this._runtime.extensionRunner;
		if (exportRunner) {
			toolRenderer = createToolHtmlRenderer({
				getToolDefinition: (name) => exportRunner.getToolDefinition(name),
				theme,
			});
		}

		return await exportSessionToHtml(this.sessionManager, this.state, {
			outputPath,
			themeName,
			toolRenderer,
		});
	}

	// =========================================================================
	// Utilities
	// =========================================================================

	/**
	 * Get text content of last assistant message.
	 * Useful for /copy command.
	 * @returns Text content, or undefined if no assistant message exists
	 */
	getLastAssistantText(): string | undefined {
		return readLastAssistantText(this.messages);
	}

	// =========================================================================
	// Extension System
	// =========================================================================

	hasExtensionHandlers(eventType: string): boolean {
		return this._runtime.hasExtensionHandlers(eventType);
	}

	get extensionRunner(): ExtensionRunner | undefined {
		return this._runtime.extensionRunner;
	}
}
