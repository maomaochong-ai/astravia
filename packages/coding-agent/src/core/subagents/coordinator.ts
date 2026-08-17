/**
 * SubagentCoordinator — registry, reservation, wait, interrupt, dispose.
 *
 * Type-agnostic: behaviour differences live on {@link SubagentTypeDefinition}.
 */

import { buildSubagentNotification, SubagentDeliveryTracker } from "./notifications.js";
import type {
	SubagentChildHandle,
	SubagentCoordinatorOptions,
	SubagentSnapshot,
	SubagentSpawnRequest,
	SubagentStatus,
	SubagentTypeId,
} from "./types.js";
import { clipFinalText, emptyUsage, isValidTaskName, taskPath } from "./types.js";

const DEFAULT_MAX_CONCURRENT = 3;
const DEFAULT_WAIT_TIMEOUT_MS = 30_000;
const MIN_WAIT_TIMEOUT_MS = 1_000;
const MAX_WAIT_TIMEOUT_MS = 300_000;
const MAX_TERMINAL_HANDLES = 50;

const MAX_SUBAGENT_STOP_CONTINUATIONS = 8;

interface InternalChild {
	snapshot: SubagentSnapshot;
	handle?: SubagentChildHandle;
	unsubscribe?: () => void;
	todoUnsubscribe?: () => void;
	/** Active slot held while pending/running. */
	holdsActiveSlot: boolean;
	/** Waiters for any terminal transition of this child. */
	waiters: Array<() => void>;
	/** Original request (todos etc.), kept until the child actually starts. */
	queuedRequest?: SubagentSpawnRequest;
	/** True after SubagentStart hooks ran successfully for this child. */
	ecosystemStartFired?: boolean;
	/** Mirrors Claude/Codex stop_hook_active for SubagentStop re-entry. */
	stopHookActive?: boolean;
	stopContinuationCount?: number;
	/** Prevents concurrent onChildAgentEnd (agent_end + prompt settle race). */
	endInFlight?: boolean;
}

function isActiveStatus(status: SubagentStatus): boolean {
	return status === "pending" || status === "running";
}

function isTerminalStatus(status: SubagentStatus): boolean {
	return status === "completed" || status === "failed" || status === "interrupted";
}

export class SubagentCoordinator {
	private readonly children = new Map<string, InternalChild>();
	private readonly byTaskName = new Map<string, string>();
	private readonly delivery = new SubagentDeliveryTracker();
	private readonly factory: SubagentCoordinatorOptions["factory"];
	private readonly typeRegistry: SubagentCoordinatorOptions["typeRegistry"];
	private readonly parentSessionId: string;
	private readonly parentSessionFile?: string;
	private readonly cwd: string;
	private readonly scenario: SubagentCoordinatorOptions["scenario"];
	private readonly getModel: SubagentCoordinatorOptions["getModel"];
	private readonly getThinkingLevel: SubagentCoordinatorOptions["getThinkingLevel"];
	private readonly getModelRegistry?: SubagentCoordinatorOptions["getModelRegistry"];
	private readonly getParentMcpTools: SubagentCoordinatorOptions["getParentMcpTools"];
	private readonly getParentContextMessages?: SubagentCoordinatorOptions["getParentContextMessages"];
	private readonly agentDir?: string;
	private readonly maxConcurrent: number;
	/** FIFO of child ids waiting for a concurrency slot (status "queued"). */
	private readonly queue: string[] = [];
	private onNotify?: SubagentCoordinatorOptions["onNotify"];
	private onUpdate?: SubagentCoordinatorOptions["onUpdate"];
	private readonly hookRuntime?: SubagentCoordinatorOptions["hookRuntime"];
	private disposed = false;
	private notifyBuffer: SubagentSnapshot[] = [];
	private notifyTimer?: ReturnType<typeof setTimeout>;

	constructor(options: SubagentCoordinatorOptions) {
		this.factory = options.factory;
		this.typeRegistry = options.typeRegistry;
		this.parentSessionId = options.parentSessionId;
		this.parentSessionFile = options.parentSessionFile;
		this.cwd = options.cwd;
		this.scenario = options.scenario;
		this.getModel = options.getModel;
		this.getThinkingLevel = options.getThinkingLevel;
		this.getModelRegistry = options.getModelRegistry;
		this.getParentMcpTools = options.getParentMcpTools;
		this.getParentContextMessages = options.getParentContextMessages;
		this.agentDir = options.agentDir;
		this.maxConcurrent = options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT;
		this.onNotify = options.onNotify;
		this.onUpdate = options.onUpdate;
		this.hookRuntime = options.hookRuntime;
	}

	list(): ReadonlyArray<SubagentSnapshot> {
		return Array.from(this.children.values())
			.map((c) => ({ ...c.snapshot }))
			.sort((a, b) => a.startedAt - b.startedAt);
	}

	get(target: string): SubagentSnapshot | undefined {
		const child = this.resolveChild(target);
		return child ? { ...child.snapshot } : undefined;
	}

	/**
	 * Remove terminal children (completed / failed / interrupted) from the registry.
	 * Driven by the host UI "clear finished" action. Does not touch pending/running.
	 * Returns how many entries were removed. Frees task_name for reuse.
	 */
	clearFinished(): number {
		if (this.disposed) return 0;
		let removed = 0;
		for (const [id, entry] of [...this.children.entries()]) {
			if (!isTerminalStatus(entry.snapshot.status)) continue;
			entry.unsubscribe?.();
			entry.unsubscribe = undefined;
			entry.todoUnsubscribe?.();
			entry.todoUnsubscribe = undefined;
			try {
				entry.handle?.dispose();
			} catch {
				// ignore dispose errors on finished children
			}
			entry.handle = undefined;
			this.byTaskName.delete(entry.snapshot.taskName);
			this.children.delete(id);
			removed++;
		}
		if (removed > 0) {
			this.emitUpdate();
		}
		return removed;
	}

	registeredTypeIds(): readonly SubagentTypeId[] {
		return this.typeRegistry.ids();
	}

	typeDocs(): string {
		return this.typeRegistry.describeForTools();
	}

	/**
	 * Reserve + create child + start prompt in background.
	 * Returns immediately with pending/running snapshot.
	 * Throws when no concurrency slot is free (use spawnMany for queueing).
	 */
	async spawn(request: SubagentSpawnRequest): Promise<SubagentSnapshot> {
		this.assertNotDisposed();
		const { taskName } = this.validateRequest(request);

		const activeCount = this.countActive();
		if (activeCount >= this.maxConcurrent) {
			throw new Error(
				`Too many active subagents (${activeCount}/${this.maxConcurrent}). Wait or interrupt one before spawning more.`,
			);
		}

		const entry = this.reserveEntry(request, taskName, "pending");
		this.emitUpdate();

		try {
			await this.startChild(entry);
			this.emitUpdate();
			return { ...entry.snapshot };
		} catch (err) {
			if (!(err instanceof SubagentStartBlockedError)) {
				this.releaseEntry(entry, "failed", err instanceof Error ? err.message : String(err));
			}
			this.emitUpdate();
			this.drainQueue();
			throw err;
		}
	}

	/**
	 * Batch dispatch: accept every request, start as many as slots allow, queue
	 * the rest (FIFO auto-refill on any terminal transition). All-or-nothing
	 * validation: any invalid request rejects the whole batch before reserving.
	 */
	spawnMany(requests: SubagentSpawnRequest[]): SubagentSnapshot[] {
		this.assertNotDisposed();
		if (requests.length === 0) {
			throw new Error("dispatch requires at least one workflow");
		}
		// A new dispatch batch supersedes finished children of the same types:
		// drop completed/failed entries so the UI shows only the current batch and
		// their task_names become reusable (ADR-0044). Active children are
		// untouched; interrupted ones are kept — they are resume candidates
		// (followup_task continues with context + todo progress intact).
		this.clearFinishedByTypes(new Set(requests.map((r) => r.agentType)));
		const seen = new Set<string>();
		const validated = requests.map((request) => {
			const { taskName } = this.validateRequest(request);
			if (seen.has(taskName)) {
				throw new Error(`Duplicate task_name "${taskName}" in this dispatch`);
			}
			seen.add(taskName);
			return { request, taskName };
		});

		const entries: InternalChild[] = [];
		for (const { request, taskName } of validated) {
			const hasSlot = this.countActive() < this.maxConcurrent;
			const entry = this.reserveEntry(request, taskName, hasSlot ? "pending" : "queued");
			if (hasSlot) {
				void this.startChildInBackground(entry);
			} else {
				this.queue.push(entry.snapshot.id);
			}
			entries.push(entry);
		}
		this.emitUpdate();
		return entries.map((e) => ({ ...e.snapshot }));
	}

	/** Reserve name + placeholder id so concurrent spawns cannot collide. */
	private reserveEntry(request: SubagentSpawnRequest, taskName: string, status: "pending" | "queued"): InternalChild {
		const provisionalId = `pending-${taskName}-${Date.now()}`;
		const snapshot: SubagentSnapshot = {
			id: provisionalId,
			taskName,
			path: taskPath(taskName),
			agentType: request.agentType,
			status,
			task: request.message,
			title: request.title?.trim() || undefined,
			parentSessionId: this.parentSessionId,
			startedAt: Date.now(),
			usage: emptyUsage(),
			generation: 0,
		};
		const entry: InternalChild = {
			snapshot,
			holdsActiveSlot: status === "pending",
			waiters: [],
			queuedRequest: request,
		};
		this.children.set(provisionalId, entry);
		this.byTaskName.set(taskName, provisionalId);
		return entry;
	}

	private validateRequest(request: SubagentSpawnRequest): { taskName: string } {
		const taskName = request.taskName.trim();
		if (!isValidTaskName(taskName)) {
			throw new Error(
				`Invalid task_name "${request.taskName}". Use lowercase letters, digits, underscore; start with a letter; not "root".`,
			);
		}
		if (!request.message.trim()) {
			throw new Error("message must be non-empty");
		}
		const typeDef = this.typeRegistry.get(request.agentType);
		if (!typeDef) {
			const known = this.typeRegistry.ids().join(", ") || "(none)";
			throw new Error(`Unknown agent_type "${request.agentType}". Registered: ${known}`);
		}
		if (this.byTaskName.has(taskName)) {
			throw new Error(`task_name "${taskName}" is already used in this session`);
		}
		if (!this.getModel()) {
			throw new Error("Cannot spawn subagent: parent has no model selected");
		}
		return { taskName };
	}

	/** Create the child session for a reserved entry and fire its initial prompt. */
	private async startChild(entry: InternalChild): Promise<void> {
		const request: SubagentSpawnRequest = entry.queuedRequest ?? {
			taskName: entry.snapshot.taskName,
			message: entry.snapshot.task,
			agentType: entry.snapshot.agentType,
		};
		entry.queuedRequest = undefined;
		const typeDef = this.typeRegistry.get(entry.snapshot.agentType);
		if (!typeDef) {
			throw new Error(`Type "${entry.snapshot.agentType}" is no longer registered`);
		}
		const model = this.getModel();
		if (!model) {
			throw new Error("Cannot spawn subagent: parent has no model selected");
		}

		const forkContextMessages = typeDef.forkParentContext ? this.getParentContextMessages?.() : undefined;

		const handle = await this.factory.create(
			{ taskName: entry.snapshot.taskName, message: request.message, agentType: typeDef.id, todos: request.todos },
			{
				parentSessionId: this.parentSessionId,
				parentSessionFile: this.parentSessionFile,
				cwd: this.cwd,
				scenario: this.scenario,
				model,
				thinkingLevel: this.getThinkingLevel(),
				agentDir: this.agentDir,
				modelRegistry: this.getModelRegistry?.(),
				parentMcpTools: this.getParentMcpTools(),
				forkContextMessages,
			},
			typeDef,
		);

		if (this.disposed) {
			handle.dispose();
			throw new Error("Parent session disposed during subagent spawn");
		}

		// Re-key under real session id.
		const provisionalId = entry.snapshot.id;
		this.children.delete(provisionalId);
		entry.snapshot.id = handle.sessionId;
		entry.snapshot.sessionFile = handle.sessionFile;
		entry.handle = handle;
		this.children.set(handle.sessionId, entry);
		this.byTaskName.set(entry.snapshot.taskName, handle.sessionId);

		entry.unsubscribe = handle.subscribe((event) => {
			if (event.type === "agent_start") {
				if (entry.snapshot.status === "pending") {
					entry.snapshot.status = "running";
					this.emitUpdate();
				}
			} else if (event.type === "agent_end") {
				void this.onChildAgentEnd(entry);
			}
		});
		if (handle.getTodoProgress) {
			entry.snapshot.todoProgress = handle.getTodoProgress();
			entry.todoUnsubscribe = handle.subscribeTodos?.((progress) => {
				entry.snapshot.todoProgress = progress;
				this.emitUpdate();
			});
		}

		// User-visible subagent is ready: SubagentStart before the first prompt.
		const startMessage = await this.fireSubagentStart(entry, request.message);
		if (startMessage === undefined) {
			// Hook blocked; child disposed and marked failed by fireSubagentStart.
			const reason = entry.snapshot.errorMessage ?? "SubagentStart ecosystem hook blocked subagent spawn";
			// Avoid double releaseEntry from callers when already terminal.
			throw new SubagentStartBlockedError(reason);
		}

		// Fire-and-forget prompt; completion via agent_end.
		void this.runInitialPrompt(entry, startMessage);
	}

	/** startChild wrapper for queued/batch children: failures notify instead of throwing. */
	private async startChildInBackground(entry: InternalChild): Promise<void> {
		try {
			await this.startChild(entry);
			this.emitUpdate();
		} catch (err) {
			if (this.disposed) return;
			if (!(err instanceof SubagentStartBlockedError)) {
				this.releaseEntry(entry, "failed", err instanceof Error ? err.message : String(err));
			}
			this.emitUpdate();
			this.queueNotification(entry.snapshot);
			this.drainQueue();
		}
	}

	/**
	 * clearFinished limited to the given agent types (no update emit; caller
	 * emits). Deliberately skips `interrupted` children: those are resumable via
	 * followup_task and must survive a new dispatch batch.
	 */
	private clearFinishedByTypes(types: ReadonlySet<SubagentTypeId>): void {
		for (const [id, entry] of [...this.children.entries()]) {
			if (!types.has(entry.snapshot.agentType)) continue;
			if (entry.snapshot.status !== "completed" && entry.snapshot.status !== "failed") continue;
			entry.unsubscribe?.();
			entry.unsubscribe = undefined;
			entry.todoUnsubscribe?.();
			entry.todoUnsubscribe = undefined;
			try {
				entry.handle?.dispose();
			} catch {
				// ignore dispose errors on finished children
			}
			entry.handle = undefined;
			this.byTaskName.delete(entry.snapshot.taskName);
			this.children.delete(id);
		}
	}

	/** Promote queued children into free concurrency slots (FIFO). */
	private drainQueue(): void {
		if (this.disposed) return;
		while (this.queue.length > 0 && this.countActive() < this.maxConcurrent) {
			const id = this.queue.shift();
			if (!id) break;
			const entry = this.children.get(id);
			if (!entry || entry.snapshot.status !== "queued") continue;
			entry.snapshot.status = "pending";
			entry.holdsActiveSlot = true;
			this.emitUpdate();
			void this.startChildInBackground(entry);
		}
	}

	private async runInitialPrompt(entry: InternalChild, message: string): Promise<void> {
		const handle = entry.handle;
		if (!handle) return;
		try {
			entry.snapshot.status = "running";
			this.emitUpdate();
			await handle.prompt(this.wrapTaskMessage(entry.snapshot, message));
			// agent_end handler completes; if prompt returns without streaming (edge), settle.
			if (!handle.isStreaming() && entry.snapshot.status === "running") {
				await this.onChildAgentEnd(entry);
			}
		} catch (err) {
			if (entry.snapshot.status === "pending" || entry.snapshot.status === "running") {
				this.releaseEntry(entry, "failed", err instanceof Error ? err.message : String(err));
				this.emitUpdate();
				this.queueNotification(entry.snapshot);
			}
		}
	}

	private wrapTaskMessage(snapshot: SubagentSnapshot, message: string): string {
		return [
			"<subagent_task>",
			`id: ${snapshot.id}`,
			`path: ${snapshot.path}`,
			`type: ${snapshot.agentType}`,
			`task_name: ${snapshot.taskName}`,
			"</subagent_task>",
			"",
			message,
		].join("\n");
	}

	private async onChildAgentEnd(entry: InternalChild): Promise<void> {
		if (!isActiveStatus(entry.snapshot.status) && entry.snapshot.status !== "running") {
			// Already terminal (e.g. interrupted).
			if (isTerminalStatus(entry.snapshot.status)) return;
		}
		if (entry.snapshot.status === "interrupted" || entry.snapshot.status === "failed") {
			return;
		}
		if (entry.snapshot.status === "completed") return;
		// agent_end listener and prompt-settle can race; only one settle path runs.
		if (entry.endInFlight) return;
		entry.endInFlight = true;

		try {
			const text = entry.handle?.getLastAssistantText() ?? null;
			entry.snapshot.finalText = text ?? undefined;

			// SubagentStop may request continuation (like root Stop).
			const continued = await this.fireSubagentStop(entry, text);
			if (continued) {
				entry.endInFlight = false;
				return;
			}

			entry.snapshot.status = "completed";
			entry.snapshot.endedAt = Date.now();
			entry.snapshot.generation += 1;
			this.releaseActiveSlot(entry);
			this.trimTerminalHandles();
			this.wakeWaiters(entry);
			this.emitUpdate();
			this.queueNotification(entry.snapshot);
			this.drainQueue();
		} catch (error) {
			entry.endInFlight = false;
			throw error;
		}
	}

	/**
	 * Run SubagentStart hooks. Returns the (possibly context-augmented) task message,
	 * or undefined when spawn must abort (child disposed and marked failed).
	 */
	private async fireSubagentStart(entry: InternalChild, message: string): Promise<string | undefined> {
		const hooks = this.hookRuntime;
		if (!hooks) {
			entry.ecosystemStartFired = true;
			return message;
		}
		const turnId = `${this.parentSessionId}:subagent-start:${entry.snapshot.id}`;
		try {
			const outcome = await hooks.runSubagentStart(
				{ agentId: entry.snapshot.id, agentType: entry.snapshot.agentType },
				turnId,
			);
			await hooks.recordAdditionalContexts(outcome.additionalContexts);
			if (outcome.shouldStop || outcome.shouldBlock) {
				const reason =
					outcome.stopReason ?? outcome.blockReason ?? "SubagentStart ecosystem hook blocked subagent spawn";
				console.info("[ecosystem-hooks] SubagentStart blocked", {
					agentId: entry.snapshot.id,
					agentType: entry.snapshot.agentType,
					reason,
				});
				this.disposeChildHandle(entry);
				entry.snapshot.errorMessage = reason;
				entry.snapshot.status = "failed";
				entry.snapshot.endedAt = Date.now();
				entry.snapshot.generation += 1;
				this.releaseActiveSlot(entry);
				return undefined;
			}
			entry.ecosystemStartFired = true;
			entry.stopHookActive = false;
			entry.stopContinuationCount = 0;
			if (outcome.additionalContexts.length === 0) return message;
			return `${outcome.additionalContexts.join("\n\n")}\n\n${message}`;
		} catch (error) {
			console.warn("[ecosystem-hooks] SubagentStart failed", error);
			entry.ecosystemStartFired = true;
			return message;
		}
	}

	/**
	 * Run SubagentStop. Returns true if the child was re-prompted (still active).
	 */
	private async fireSubagentStop(entry: InternalChild, lastAssistantMessage: string | null): Promise<boolean> {
		const hooks = this.hookRuntime;
		if (!hooks || !entry.ecosystemStartFired) return false;

		const turnId = `${this.parentSessionId}:subagent-stop:${entry.snapshot.id}:${entry.snapshot.generation}`;
		try {
			const outcome = await hooks.runSubagentStop({
				agentId: entry.snapshot.id,
				agentType: entry.snapshot.agentType,
				turnId,
				stopHookActive: entry.stopHookActive === true,
				lastAssistantMessage,
				agentTranscriptPath: entry.snapshot.sessionFile ?? null,
			});
			await hooks.recordAdditionalContexts(outcome.additionalContexts);

			const canContinue =
				outcome.shouldBlock &&
				!outcome.shouldStop &&
				outcome.continuationFragments.length > 0 &&
				entry.handle &&
				(entry.stopContinuationCount ?? 0) < MAX_SUBAGENT_STOP_CONTINUATIONS;

			if (canContinue && entry.handle) {
				entry.stopHookActive = true;
				entry.stopContinuationCount = (entry.stopContinuationCount ?? 0) + 1;
				const fragment = outcome.continuationFragments.join("\n\n");
				console.info("[ecosystem-hooks] SubagentStop continuation", {
					agentId: entry.snapshot.id,
					count: entry.stopContinuationCount,
				});
				void entry.handle.prompt(fragment).then(
					() => {
						if (entry.handle && !entry.handle.isStreaming() && entry.snapshot.status === "running") {
							void this.onChildAgentEnd(entry);
						}
					},
					(err) => {
						if (entry.snapshot.status === "running" || entry.snapshot.status === "pending") {
							this.releaseEntry(entry, "failed", err instanceof Error ? err.message : String(err));
							this.emitUpdate();
							this.queueNotification(entry.snapshot);
							this.drainQueue();
						}
					},
				);
				return true;
			}
		} catch (error) {
			console.warn("[ecosystem-hooks] SubagentStop failed", error);
		}
		return false;
	}

	private disposeChildHandle(entry: InternalChild): void {
		entry.unsubscribe?.();
		entry.unsubscribe = undefined;
		entry.todoUnsubscribe?.();
		entry.todoUnsubscribe = undefined;
		try {
			entry.handle?.dispose();
		} catch {
			// ignore
		}
		entry.handle = undefined;
	}

	async sendMessage(target: string, message: string): Promise<SubagentSnapshot> {
		this.assertNotDisposed();
		const entry = this.requireChild(target);
		if (!entry.handle) {
			throw new Error(`Subagent "${target}" has no live session`);
		}
		if (!message.trim()) {
			throw new Error("message must be non-empty");
		}
		await entry.handle.sendMessage(message);
		return { ...entry.snapshot };
	}

	async followUp(target: string, message: string): Promise<SubagentSnapshot> {
		this.assertNotDisposed();
		const entry = this.requireChild(target);
		if (!message.trim()) {
			throw new Error("message must be non-empty");
		}

		const typeDef = this.typeRegistry.get(entry.snapshot.agentType);
		if (!typeDef) {
			throw new Error(`Type "${entry.snapshot.agentType}" is no longer registered`);
		}

		if (!entry.handle) {
			if (!this.factory.reopen) {
				throw new Error(`Subagent "${target}" is not live and reopen is not supported`);
			}
			const model = this.getModel();
			if (!model) throw new Error("Cannot reopen subagent: parent has no model");
			entry.handle = await this.factory.reopen(
				entry.snapshot,
				{
					parentSessionId: this.parentSessionId,
					parentSessionFile: this.parentSessionFile,
					cwd: this.cwd,
					scenario: this.scenario,
					model,
					thinkingLevel: this.getThinkingLevel(),
					agentDir: this.agentDir,
					modelRegistry: this.getModelRegistry?.(),
					parentMcpTools: this.getParentMcpTools(),
				},
				typeDef,
			);
			entry.unsubscribe = entry.handle.subscribe((event) => {
				if (event.type === "agent_start" && entry.snapshot.status === "pending") {
					entry.snapshot.status = "running";
					this.emitUpdate();
				} else if (event.type === "agent_end") {
					void this.onChildAgentEnd(entry);
				}
			});
			if (entry.handle.getTodoProgress) {
				entry.snapshot.todoProgress = entry.handle.getTodoProgress();
				entry.todoUnsubscribe = entry.handle.subscribeTodos?.((progress) => {
					entry.snapshot.todoProgress = progress;
					this.emitUpdate();
				});
			}
		}

		if (isTerminalStatus(entry.snapshot.status)) {
			if (!entry.holdsActiveSlot) {
				if (this.countActive() >= this.maxConcurrent) {
					throw new Error(`Too many active subagents (${this.maxConcurrent} max)`);
				}
				entry.holdsActiveSlot = true;
			}
			entry.snapshot.status = "running";
			entry.snapshot.task = message;
			entry.snapshot.endedAt = undefined;
			entry.snapshot.errorMessage = undefined;
			this.emitUpdate();
			void (async () => {
				try {
					await entry.handle?.prompt(message);
					if (entry.handle && !entry.handle.isStreaming() && entry.snapshot.status === "running") {
						await this.onChildAgentEnd(entry);
					}
				} catch (err) {
					this.releaseEntry(entry, "failed", err instanceof Error ? err.message : String(err));
					this.emitUpdate();
					this.queueNotification(entry.snapshot);
				}
			})();
			return { ...entry.snapshot };
		}

		await entry.handle.followUp(message);
		entry.snapshot.task = message;
		this.emitUpdate();
		return { ...entry.snapshot };
	}

	interrupt(target: string): SubagentSnapshot {
		this.assertNotDisposed();
		const entry = this.requireChild(target);
		if (isTerminalStatus(entry.snapshot.status)) {
			return { ...entry.snapshot };
		}
		const lastText = entry.handle?.getLastAssistantText() ?? null;
		entry.handle?.abort();
		entry.queuedRequest = undefined;
		entry.snapshot.finalText = lastText ?? entry.snapshot.finalText;
		entry.snapshot.status = "interrupted";
		entry.snapshot.endedAt = Date.now();
		entry.snapshot.generation += 1;
		this.releaseActiveSlot(entry);
		this.wakeWaiters(entry);
		this.emitUpdate();
		this.queueNotification(entry.snapshot);
		this.drainQueue();
		// Best-effort SubagentStop after terminal mark (must not re-prompt).
		void this.fireSubagentStopTerminal(entry, lastText);
		return { ...entry.snapshot };
	}

	/** SubagentStop for terminal paths that must not continue the child. */
	private async fireSubagentStopTerminal(entry: InternalChild, lastAssistantMessage: string | null): Promise<void> {
		const hooks = this.hookRuntime;
		if (!hooks || !entry.ecosystemStartFired) return;
		try {
			const outcome = await hooks.runSubagentStop({
				agentId: entry.snapshot.id,
				agentType: entry.snapshot.agentType,
				turnId: `${this.parentSessionId}:subagent-stop:${entry.snapshot.id}:${entry.snapshot.generation}`,
				stopHookActive: entry.stopHookActive === true,
				lastAssistantMessage,
				agentTranscriptPath: entry.snapshot.sessionFile ?? null,
			});
			await hooks.recordAdditionalContexts(outcome.additionalContexts);
		} catch (error) {
			console.warn("[ecosystem-hooks] SubagentStop (terminal) failed", error);
		}
	}

	/**
	 * Event-driven wait for any of the targets to become terminal.
	 * Claims delivery so auto-notification is suppressed for returned agents.
	 */
	async wait(options?: {
		targets?: string[];
		timeoutMs?: number;
	}): Promise<{ timedOut: boolean; agents: SubagentSnapshot[] }> {
		this.assertNotDisposed();
		const timeoutMs = clamp(options?.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS, MIN_WAIT_TIMEOUT_MS, MAX_WAIT_TIMEOUT_MS);

		const resolveTargets = (): InternalChild[] => {
			if (!options?.targets || options.targets.length === 0) {
				return Array.from(this.children.values()).filter(
					(c) => !isTerminalStatus(c.snapshot.status) || this.hasUndelivered(c),
				);
			}
			return options.targets.map((t) => this.requireChild(t));
		};

		const collectReady = (): SubagentSnapshot[] => {
			const ready: SubagentSnapshot[] = [];
			for (const child of resolveTargets()) {
				if (!isTerminalStatus(child.snapshot.status)) continue;
				if (!this.delivery.tryClaim(child.snapshot.id, child.snapshot.generation)) continue;
				ready.push({
					...child.snapshot,
					finalText: clipFinalText(child.snapshot.finalText),
				});
			}
			return ready;
		};

		const immediate = collectReady();
		if (immediate.length > 0) {
			return { timedOut: false, agents: immediate };
		}

		const active = resolveTargets().filter((c) => !isTerminalStatus(c.snapshot.status));
		if (active.length === 0) {
			return { timedOut: false, agents: [] };
		}

		return new Promise((resolve) => {
			let settled = false;
			const finish = (timedOut: boolean) => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				for (const child of active) {
					const idx = child.waiters.indexOf(onWake);
					if (idx !== -1) child.waiters.splice(idx, 1);
				}
				const agents = collectReady();
				resolve({ timedOut, agents });
			};

			const onWake = () => {
				const agents = collectReady();
				if (agents.length > 0) finish(false);
			};

			for (const child of active) {
				child.waiters.push(onWake);
			}

			const timer = setTimeout(() => finish(true), timeoutMs);
		});
	}

	async dispose(): Promise<void> {
		if (this.disposed) return;
		this.disposed = true;
		if (this.notifyTimer) {
			clearTimeout(this.notifyTimer);
			this.notifyTimer = undefined;
		}
		this.notifyBuffer = [];
		this.onNotify = undefined;

		this.queue.length = 0;
		const entries = Array.from(this.children.values());
		for (const entry of entries) {
			if (!isTerminalStatus(entry.snapshot.status)) {
				entry.handle?.abort();
				entry.snapshot.status = "interrupted";
				entry.snapshot.endedAt = Date.now();
				entry.snapshot.generation += 1;
			}
			this.releaseActiveSlot(entry);
			this.wakeWaiters(entry);
			entry.unsubscribe?.();
			entry.unsubscribe = undefined;
			entry.todoUnsubscribe?.();
			entry.todoUnsubscribe = undefined;
			try {
				entry.handle?.dispose();
			} catch {
				// ignore dispose errors
			}
			entry.handle = undefined;
		}
		this.emitUpdate();
	}

	// ── internals ──────────────────────────────────────────────

	private hasUndelivered(child: InternalChild): boolean {
		return (
			isTerminalStatus(child.snapshot.status) &&
			!this.delivery.isDelivered(child.snapshot.id, child.snapshot.generation)
		);
	}

	private countActive(): number {
		let n = 0;
		for (const c of this.children.values()) {
			if (c.holdsActiveSlot && isActiveStatus(c.snapshot.status)) n++;
		}
		return n;
	}

	private releaseActiveSlot(entry: InternalChild): void {
		entry.holdsActiveSlot = false;
	}

	private releaseEntry(entry: InternalChild, status: "failed" | "interrupted", errorMessage?: string): void {
		const lastText = entry.handle?.getLastAssistantText() ?? entry.snapshot.finalText ?? null;
		entry.snapshot.status = status;
		entry.snapshot.endedAt = Date.now();
		entry.snapshot.errorMessage = errorMessage;
		entry.snapshot.finalText = lastText ?? undefined;
		entry.snapshot.generation += 1;
		entry.queuedRequest = undefined;
		this.releaseActiveSlot(entry);
		this.wakeWaiters(entry);
		this.disposeChildHandle(entry);
		// Keep task name reserved so list/follow-up can still resolve historical children.
		void this.fireSubagentStopTerminal(entry, lastText);
	}

	private wakeWaiters(entry: InternalChild): void {
		const waiters = entry.waiters.splice(0);
		for (const w of waiters) w();
	}

	private resolveChild(target: string): InternalChild | undefined {
		const direct = this.children.get(target);
		if (direct) return direct;
		const byName = this.byTaskName.get(target);
		if (byName) return this.children.get(byName);
		if (target.startsWith("/root/")) {
			const name = target.slice("/root/".length);
			const id = this.byTaskName.get(name);
			if (id) return this.children.get(id);
		}
		return undefined;
	}

	private requireChild(target: string): InternalChild {
		const child = this.resolveChild(target);
		if (!child) {
			throw new Error(`Subagent "${target}" not found`);
		}
		return child;
	}

	private trimTerminalHandles(): void {
		const terminal = Array.from(this.children.values())
			.filter((c) => isTerminalStatus(c.snapshot.status) && c.handle)
			.sort((a, b) => (a.snapshot.endedAt ?? 0) - (b.snapshot.endedAt ?? 0));
		while (terminal.length > MAX_TERMINAL_HANDLES) {
			const old = terminal.shift();
			if (!old) break;
			old.unsubscribe?.();
			old.unsubscribe = undefined;
			old.todoUnsubscribe?.();
			old.todoUnsubscribe = undefined;
			try {
				old.handle?.dispose();
			} catch {
				// ignore
			}
			old.handle = undefined;
		}
	}

	private queueNotification(snapshot: SubagentSnapshot): void {
		if (this.disposed || !this.onNotify) return;
		if (this.delivery.isDelivered(snapshot.id, snapshot.generation)) return;
		this.notifyBuffer.push({ ...snapshot });
		if (this.notifyTimer) return;
		this.notifyTimer = setTimeout(() => {
			this.notifyTimer = undefined;
			this.flushNotifications();
		}, 50);
	}

	private flushNotifications(): void {
		if (this.disposed || !this.onNotify) {
			this.notifyBuffer = [];
			return;
		}
		const batch: SubagentSnapshot[] = [];
		for (const snap of this.notifyBuffer) {
			if (this.delivery.tryClaim(snap.id, snap.generation)) {
				batch.push({
					...snap,
					finalText: clipFinalText(snap.finalText),
				});
			}
		}
		this.notifyBuffer = [];
		if (batch.length === 0) return;
		this.onNotify(buildSubagentNotification(batch));
	}

	private emitUpdate(): void {
		this.onUpdate?.(this.list());
	}

	private assertNotDisposed(): void {
		if (this.disposed) {
			throw new Error("SubagentCoordinator is disposed");
		}
	}
}

function clamp(n: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, n));
}

/** Spawn aborted by SubagentStart hook; entry is already terminal. */
class SubagentStartBlockedError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "SubagentStartBlockedError";
	}
}
