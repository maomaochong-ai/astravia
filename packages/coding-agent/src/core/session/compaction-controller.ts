/**
 * Compaction controller — manual + automatic context compaction.
 *
 * Extracted from AgentSession. Owns the compaction abort controllers and the
 * circuit breaker; reaches the rest of the session through SessionContext.
 *
 * Two automatic triggers:
 * - Overflow: LLM returned a context-overflow error → compact, then auto-retry.
 * - Threshold: context over the configured threshold → compact, no auto-retry.
 */

import type { AgentMessage } from "@astravia/agent-core";
import type { AssistantMessage } from "@astravia/ai";
import { isContextOverflow } from "@astravia/ai";
import {
	CompactionCircuitBreaker,
	type CompactionResult,
	calculateContextTokens,
	compact,
	estimateContextTokens,
	fingerprintCompactionPrefix,
	isPrefireCacheValid,
	microcompact,
	type PrefireCache,
	prepareCompaction,
	shouldCompact,
	shouldPrefire,
} from "../compaction/index.js";
import type { SessionBeforeCompactResult } from "../extensions/index.js";
import { flushMemoryBeforeRollover } from "../memory/memory-flush.js";
import { appendJournalSection } from "../memory/memory-journal.js";
import { type CompactionEntry, getLatestCompactionEntry, type SessionEntry } from "../session-manager/index.js";
import type { SettingsManager } from "../settings-manager.js";
import type { SessionContext } from "./session-context.js";

export class CompactionController {
	private _compactionAbortController: AbortController | undefined = undefined;
	private _autoCompactionAbortController: AbortController | undefined = undefined;
	private _circuitBreaker = new CompactionCircuitBreaker();
	/** Prefire 后台预压缩：缓存 + 单飞锁（同一时刻至多一个 prefire 在跑）。 */
	private _prefireCache: PrefireCache | undefined = undefined;
	private _prefireAbortController: AbortController | undefined = undefined;
	/** 抑制日志去重：熔断拦截只在状态翻转时打一条。 */
	private _suppressLogged = false;

	constructor(private readonly ctx: SessionContext) {}

	/** Whether compaction (manual or auto) is currently running. */
	get isCompacting(): boolean {
		return this._autoCompactionAbortController !== undefined || this._compactionAbortController !== undefined;
	}

	/** Cancel in-progress compaction (manual or auto) and any background prefire. */
	abort(): void {
		this._compactionAbortController?.abort();
		this._autoCompactionAbortController?.abort();
		this._prefireAbortController?.abort();
	}

	/**
	 * Consolidate durable facts from the CURRENT context into MEMORY.md on demand
	 * (ADR-0009). memory-mode only; best-effort; returns the number of entries written.
	 */
	async flushMemory(): Promise<number> {
		if (!this.ctx.memoryMode || !this.ctx.memoryFile || !this.ctx.model) return 0;
		const apiKey = await this.ctx.modelRegistry.getApiKey(this.ctx.model);
		if (!apiKey) return 0;
		const messages = this.ctx.sessionManager.buildSessionContext().messages;
		if (messages.length === 0) return 0;
		const written = await flushMemoryBeforeRollover({
			memoryFile: this.ctx.memoryFile,
			limit: this.ctx.memoryCharLimit,
			messages,
			model: this.ctx.model,
			apiKey,
		});
		return written.length;
	}

	/**
	 * Manually compact the session context.
	 * Aborts current agent operation first.
	 */
	async compact(customInstructions?: string): Promise<CompactionResult> {
		this.ctx.disconnectFromAgent();
		await this.ctx.abort();
		this._compactionAbortController = new AbortController();

		try {
			if (!this.ctx.model) {
				throw new Error("No model selected");
			}

			const apiKey = await this.ctx.modelRegistry.getApiKey(this.ctx.model);
			if (!apiKey) {
				throw new Error(`No API key for ${this.ctx.model.provider}`);
			}

			const pathEntries = this.ctx.sessionManager.getBranch();
			const settings = this.ctx.settingsManager.getCompactionSettings();

			const preparation = prepareCompaction(pathEntries, settings);
			if (!preparation) {
				// Check why we can't compact
				const lastEntry = pathEntries[pathEntries.length - 1];
				if (lastEntry?.type === "compaction") {
					throw new Error("Already compacted");
				}
				throw new Error("Nothing to compact (session too small)");
			}

			const preHookOutcome = await this.ctx.hookRuntime.runPreCompact(
				"manual",
				this._compactionAbortController.signal,
			);
			if (preHookOutcome.shouldStop || preHookOutcome.shouldBlock) {
				throw new Error(preHookOutcome.stopReason ?? preHookOutcome.blockReason ?? "Compaction blocked by hook");
			}

			let extensionCompaction: CompactionResult | undefined;
			let fromExtension = false;

			if (this.ctx.extensionRunner?.hasHandlers("session_before_compact")) {
				const result = (await this.ctx.extensionRunner.emit({
					type: "session_before_compact",
					preparation,
					branchEntries: pathEntries,
					customInstructions,
					signal: this._compactionAbortController.signal,
				})) as SessionBeforeCompactResult | undefined;

				if (result?.cancel) {
					throw new Error("Compaction cancelled");
				}

				if (result?.compaction) {
					extensionCompaction = result.compaction;
					fromExtension = true;
				}
			}

			let summary: string;
			let firstKeptEntryId: string;
			let tokensBefore: number;
			let details: unknown;

			if (extensionCompaction) {
				// Extension provided compaction content
				summary = extensionCompaction.summary;
				firstKeptEntryId = extensionCompaction.firstKeptEntryId;
				tokensBefore = extensionCompaction.tokensBefore;
				details = extensionCompaction.details;
			} else {
				// Generate compaction result
				const result = await compact(
					preparation,
					this.ctx.model,
					apiKey,
					customInstructions,
					this._compactionAbortController.signal,
				);
				summary = result.summary;
				firstKeptEntryId = result.firstKeptEntryId;
				tokensBefore = result.tokensBefore;
				details = result.details;
			}

			if (this._compactionAbortController.signal.aborted) {
				throw new Error("Compaction cancelled");
			}

			this.ctx.sessionManager.appendCompaction(summary, firstKeptEntryId, tokensBefore, details, fromExtension);
			const newEntries = this.ctx.sessionManager.getEntries();
			const sessionContext = this.ctx.sessionManager.buildSessionContext();
			this.ctx.agent.replaceMessages(sessionContext.messages);

			// Get the saved compaction entry for the extension event
			const savedCompactionEntry = newEntries.find((e) => e.type === "compaction" && e.summary === summary) as
				| CompactionEntry
				| undefined;

			if (this.ctx.extensionRunner && savedCompactionEntry) {
				await this.ctx.extensionRunner.emit({
					type: "session_compact",
					compactionEntry: savedCompactionEntry,
					fromExtension,
				});
			}

			await this.ctx.hookRuntime.runPostCompact("manual", this._compactionAbortController.signal);
			this.ctx.hookRuntime.markSessionStart("compact");

			return {
				summary,
				firstKeptEntryId,
				tokensBefore,
				details,
			};
		} finally {
			this._compactionAbortController = undefined;
			this.ctx.reconnectToAgent();
		}
	}

	/**
	 * Compaction trigger settings, adjusted for memory-mode (ADR-0009).
	 *
	 * memory-mode rolls over earlier (~70% of the context window) so each jsonl
	 * stays small. getCompactThreshold takes max(window - reserve, window *
	 * (1 - minFreePercent/100)); to actually trigger at ~70% on large windows we
	 * must lower BOTH terms, so bump minFreePercent to 30 AND raise reserveTokens
	 * to ≥30% of the window. keepRecentTokens (the carried tail) is untouched.
	 * Off for non-memory sessions — desktop/TUI behaviour is unchanged.
	 */
	private settingsFor(contextWindow: number): ReturnType<SettingsManager["getCompactionSettings"]> {
		const base = this.ctx.settingsManager.getCompactionSettings();
		if (!this.ctx.memoryMode) return base;
		return {
			...base,
			minFreePercent: Math.max(base.minFreePercent, 30),
			reserveTokens:
				contextWindow > 0 ? Math.max(base.reserveTokens, Math.ceil(contextWindow * 0.3)) : base.reserveTokens,
		};
	}

	/**
	 * Pre-LLM-call compaction. Called from transformContext before each LLM call.
	 *
	 * Layer 1: microcompact — clears old tool results (pure, zero cost).
	 * Layer 2: LLM compact  — if above threshold & circuit breaker allows.
	 */
	async preCallCompaction(messages: AgentMessage[], _signal?: AbortSignal): Promise<AgentMessage[]> {
		// Layer 1: microcompact (always runs)
		messages = microcompact(messages);

		// Layer 2: check if LLM compact is needed
		const settings = this.ctx.settingsManager.getCompactionSettings();
		if (!settings.enabled) return messages;

		const contextWindow = this.ctx.model?.contextWindow ?? 0;
		if (contextWindow <= 0) return messages;

		const estimate = estimateContextTokens(messages);
		if (!shouldCompact(estimate.tokens, contextWindow, this.settingsFor(contextWindow))) {
			// 阈值未到但已进入 lead 区间 → 后台 prefire，把摘要提前算好
			if (shouldPrefire(estimate.tokens, contextWindow, this.settingsFor(contextWindow))) {
				this.maybeStartPrefire();
			}
			return messages;
		}

		// Circuit breaker check
		if (!this._circuitBreaker.canAttempt()) {
			if (!this._suppressLogged) {
				this._suppressLogged = true;
				console.info(
					`[compaction] auto-compaction suppressed: circuit breaker open (${this._circuitBreaker.consecutiveFailures} consecutive failures)`,
				);
			}
			return messages;
		}
		this._suppressLogged = false;

		// Concurrency guard: skip if compaction is already running
		if (this._autoCompactionAbortController) return messages;

		try {
			await this.runAutoCompaction("threshold", false);
			this._circuitBreaker.recordSuccess();
			// Return fresh messages after compaction
			return this.ctx.sessionManager.buildSessionContext().messages;
		} catch {
			this._circuitBreaker.recordFailure();
			return messages;
		}
	}

	/**
	 * 启动后台 prefire（幂等：已在跑 / 正式压缩在跑 / 熔断打开 时直接返回）。
	 * 结果写入 _prefireCache；任何失败都静默（best-effort，正式路径兜底）。
	 */
	private maybeStartPrefire(): void {
		if (this._prefireAbortController || this.isCompacting) return;
		if (!this._circuitBreaker.canAttempt()) return;
		if (!this.ctx.model) return;
		this._prefireAbortController = new AbortController();
		void this.runPrefire(this._prefireAbortController.signal).finally(() => {
			this._prefireAbortController = undefined;
		});
	}

	private async runPrefire(signal: AbortSignal): Promise<void> {
		try {
			const model = this.ctx.model;
			if (!model) return;
			const apiKey = await this.ctx.modelRegistry.getApiKey(model);
			if (!apiKey) return;
			const pathEntries = this.ctx.sessionManager.getBranch();
			const settings = this.ctx.settingsManager.getCompactionSettings();
			const preparation = prepareCompaction(pathEntries, settings);
			if (!preparation) return;
			const fingerprint = fingerprintCompactionPrefix(pathEntries, preparation.firstKeptEntryId);
			if (!fingerprint) return;
			// 同一前缀已有缓存 → 不重复花钱
			if (this._prefireCache?.fingerprint === fingerprint) return;
			const result = await compact(preparation, model, apiKey, undefined, signal);
			if (signal.aborted) return;
			this._prefireCache = { fingerprint, result };
			console.info(
				`[compaction] prefire cached (tokensBefore=${result.tokensBefore}, firstKept=${result.firstKeptEntryId})`,
			);
		} catch {
			// best-effort：prefire 失败不动熔断计数，正式压缩路径自会重试并计数
		}
	}

	/**
	 * 取出对当前分支仍有效的 prefire 缓存（取出即清空；无效也清空并返回 undefined）。
	 */
	private takeValidPrefireCache(pathEntries: SessionEntry[]): CompactionResult | undefined {
		const cache = this._prefireCache;
		if (!cache) return undefined;
		this._prefireCache = undefined;
		if (!isPrefireCacheValid(cache, pathEntries)) return undefined;
		return cache.result;
	}

	/**
	 * Check if compaction is needed and run it.
	 * Called after agent_end and before prompt submission.
	 *
	 * Two cases:
	 * 1. Overflow: LLM returned context overflow error, remove error message from agent state, compact, auto-retry
	 * 2. Threshold: Context over threshold, compact, NO auto-retry (user continues manually)
	 *
	 * @param assistantMessage The assistant message to check
	 * @param skipAbortedCheck If false, include aborted messages (for pre-prompt check). Default: true
	 */
	async checkCompaction(assistantMessage: AssistantMessage, skipAbortedCheck = true): Promise<void> {
		const settings = this.ctx.settingsManager.getCompactionSettings();
		if (!settings.enabled) return;

		// Skip if message was aborted (user cancelled) - unless skipAbortedCheck is false
		if (skipAbortedCheck && assistantMessage.stopReason === "aborted") return;

		const contextWindow = this.ctx.model?.contextWindow ?? 0;

		// Skip overflow check if the message came from a different model.
		// This handles the case where user switched from a smaller-context model (e.g. opus)
		// to a larger-context model (e.g. codex) - the overflow error from the old model
		// shouldn't trigger compaction for the new model.
		const sameModel =
			this.ctx.model &&
			assistantMessage.provider === this.ctx.model.provider &&
			assistantMessage.model === this.ctx.model.id;

		// Skip overflow check if the error is from before a compaction in the current path.
		// This handles the case where an error was kept after compaction (in the "kept" region).
		// The error shouldn't trigger another compaction since we already compacted.
		// Example: opus fails → switch to codex → compact → switch back to opus → opus error
		// is still in context but shouldn't trigger compaction again.
		const compactionEntry = getLatestCompactionEntry(this.ctx.sessionManager.getBranch());
		const errorIsFromBeforeCompaction =
			compactionEntry !== null && assistantMessage.timestamp < new Date(compactionEntry.timestamp).getTime();

		// Case 1: Overflow - LLM returned context overflow error
		if (sameModel && !errorIsFromBeforeCompaction && isContextOverflow(assistantMessage, contextWindow)) {
			// Remove the error message from agent state (it IS saved to session for history,
			// but we don't want it in context for the retry)
			const messages = this.ctx.agent.state.messages;
			if (messages.length > 0 && messages[messages.length - 1].role === "assistant") {
				this.ctx.agent.replaceMessages(messages.slice(0, -1));
			}
			await this.runAutoCompaction("overflow", true);
			return;
		}

		// Case 2: Threshold - turn succeeded but context is getting large
		// Skip if this was an error (non-overflow errors don't have usage data)
		if (assistantMessage.stopReason === "error") return;

		const contextTokens = calculateContextTokens(assistantMessage.usage);
		if (shouldCompact(contextTokens, contextWindow, this.settingsFor(contextWindow))) {
			await this.runAutoCompaction("threshold", false);
		}
	}

	/**
	 * Internal: Run auto-compaction with events.
	 */
	private async runAutoCompaction(reason: "overflow" | "threshold", willRetry: boolean): Promise<void> {
		const settings = this.ctx.settingsManager.getCompactionSettings();

		this.ctx.emit({ type: "auto_compaction_start", reason });
		this._autoCompactionAbortController = new AbortController();

		try {
			if (!this.ctx.model) {
				this.ctx.emit({ type: "auto_compaction_end", result: undefined, aborted: false, willRetry: false });
				return;
			}

			const apiKey = await this.ctx.modelRegistry.getApiKey(this.ctx.model);
			if (!apiKey) {
				this.ctx.emit({ type: "auto_compaction_end", result: undefined, aborted: false, willRetry: false });
				return;
			}

			const pathEntries = this.ctx.sessionManager.getBranch();

			const preparation = prepareCompaction(pathEntries, settings);
			if (!preparation) {
				this.ctx.emit({ type: "auto_compaction_end", result: undefined, aborted: false, willRetry: false });
				return;
			}

			const preHookOutcome = await this.ctx.hookRuntime.runPreCompact(
				"auto",
				this._autoCompactionAbortController.signal,
			);
			if (preHookOutcome.shouldStop || preHookOutcome.shouldBlock) {
				this.ctx.emit({ type: "auto_compaction_end", result: undefined, aborted: true, willRetry: false });
				return;
			}

			// memory-mode (ADR-0009): flush durable facts out of the
			// about-to-be-discarded context into MEMORY.md BEFORE summarizing, so
			// the rollover never silently loses what's worth remembering. Best
			// effort — flush failures must not block compaction/rollover.
			if (this.ctx.memoryMode && this.ctx.memoryFile && this.ctx.model) {
				// Disk-only write; the frozen system-prompt snapshot is intentionally
				// left as-is and picks the new entries up on the next session.
				await flushMemoryBeforeRollover({
					memoryFile: this.ctx.memoryFile,
					limit: this.ctx.memoryCharLimit,
					messages: preparation.messagesToSummarize,
					model: this.ctx.model,
					apiKey,
					signal: this._autoCompactionAbortController.signal,
				});
			}

			let extensionCompaction: CompactionResult | undefined;
			let fromExtension = false;

			if (this.ctx.extensionRunner?.hasHandlers("session_before_compact")) {
				const extensionResult = (await this.ctx.extensionRunner.emit({
					type: "session_before_compact",
					preparation,
					branchEntries: pathEntries,
					customInstructions: undefined,
					signal: this._autoCompactionAbortController.signal,
				})) as SessionBeforeCompactResult | undefined;

				if (extensionResult?.cancel) {
					this.ctx.emit({ type: "auto_compaction_end", result: undefined, aborted: true, willRetry: false });
					return;
				}

				if (extensionResult?.compaction) {
					extensionCompaction = extensionResult.compaction;
					fromExtension = true;
				}
			}

			let summary: string;
			let firstKeptEntryId: string;
			let tokensBefore: number;
			let details: unknown;

			if (extensionCompaction) {
				// Extension provided compaction content
				summary = extensionCompaction.summary;
				firstKeptEntryId = extensionCompaction.firstKeptEntryId;
				tokensBefore = extensionCompaction.tokensBefore;
				details = extensionCompaction.details;
			} else {
				// prefire 缓存命中（前缀指纹匹配）→ 免 LLM 调用，瞬时完成。
				// 沿用 prefire 时的切点：保留尾巴比按当下重切略大，但受 lead 上限约束。
				const prefired = this.takeValidPrefireCache(pathEntries);
				const compactResult =
					prefired ??
					(await compact(
						preparation,
						this.ctx.model,
						apiKey,
						undefined,
						this._autoCompactionAbortController.signal,
					));
				if (prefired) {
					console.info("[compaction] prefire cache hit — applied without LLM call");
				}
				summary = compactResult.summary;
				firstKeptEntryId = compactResult.firstKeptEntryId;
				tokensBefore = compactResult.tokensBefore;
				details = compactResult.details;
			}

			if (this._autoCompactionAbortController.signal.aborted) {
				this.ctx.emit({ type: "auto_compaction_end", result: undefined, aborted: true, willRetry: false });
				return;
			}

			this.ctx.sessionManager.appendCompaction(summary, firstKeptEntryId, tokensBefore, details, fromExtension);

			// memory-mode (ADR-0009): instead of leaving the compaction appended to
			// an ever-growing jsonl, roll the compacted state (summary + kept tail)
			// into a fresh, small file pointing back at the old one. The resolved
			// messages are identical, so agent state / willRetry are unaffected.
			// Emit session_path_changed so im-gateway repoints its routing state.
			if (this.ctx.memoryMode) {
				appendJournalSection(this.ctx.cwd, summary);
				const { from, to } = this.ctx.sessionManager.rolloverToNewFile();
				if (to && to !== from) {
					this.ctx.emit({ type: "session_path_changed", from, to, reason: "rollover" });
				}
			}

			const newEntries = this.ctx.sessionManager.getEntries();
			const sessionContext = this.ctx.sessionManager.buildSessionContext();
			this.ctx.agent.replaceMessages(sessionContext.messages);

			// Get the saved compaction entry for the extension event
			const savedCompactionEntry = newEntries.find((e) => e.type === "compaction" && e.summary === summary) as
				| CompactionEntry
				| undefined;

			if (this.ctx.extensionRunner && savedCompactionEntry) {
				await this.ctx.extensionRunner.emit({
					type: "session_compact",
					compactionEntry: savedCompactionEntry,
					fromExtension,
				});
			}

			const postHookOutcome = await this.ctx.hookRuntime.runPostCompact(
				"auto",
				this._autoCompactionAbortController.signal,
			);
			this.ctx.hookRuntime.markSessionStart("compact");

			const result: CompactionResult = {
				summary,
				firstKeptEntryId,
				tokensBefore,
				details,
			};
			this._circuitBreaker.recordSuccess();
			const shouldRetry = willRetry && !postHookOutcome.shouldStop;
			this.ctx.emit({ type: "auto_compaction_end", result, aborted: false, willRetry: shouldRetry });

			if (shouldRetry) {
				const messages = this.ctx.agent.state.messages;
				const lastMsg = messages[messages.length - 1];
				if (lastMsg?.role === "assistant" && (lastMsg as AssistantMessage).stopReason === "error") {
					this.ctx.agent.replaceMessages(messages.slice(0, -1));
				}

				setTimeout(() => {
					this.ctx.agent.continue().catch(() => {});
				}, 100);
			} else if (!postHookOutcome.shouldStop && this.ctx.agent.hasQueuedMessages()) {
				// Auto-compaction can complete while follow-up/steering/custom messages are waiting.
				// Kick the loop so queued messages are actually delivered.
				setTimeout(() => {
					this.ctx.agent.continue().catch(() => {});
				}, 100);
			}
		} catch (error) {
			this._circuitBreaker.recordFailure();
			const errorMessage = error instanceof Error ? error.message : "compaction failed";
			this.ctx.emit({
				type: "auto_compaction_end",
				result: undefined,
				aborted: false,
				willRetry: false,
				errorMessage:
					reason === "overflow"
						? `Context overflow recovery failed: ${errorMessage}`
						: `Auto-compaction failed: ${errorMessage}`,
			});
		} finally {
			this._autoCompactionAbortController = undefined;
		}
	}
}
