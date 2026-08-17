/**
 * Session navigation — new / switch / fork / tree navigation + branch summary.
 *
 * Extracted from AgentSession. Owns the branch-summary abort controller and
 * orchestrates the session lifecycle transitions, reaching the model and queue
 * controllers for model restore and queue resets.
 */

import type { ThinkingLevel } from "@astravia/agent-core";
import { collectEntriesForBranchSummary, generateBranchSummary } from "../compaction/index.js";
import { DEFAULT_THINKING_LEVEL } from "../defaults.js";
import type {
	SessionBeforeForkResult,
	SessionBeforeSwitchResult,
	SessionBeforeTreeResult,
	TreePreparation,
} from "../extensions/index.js";
import type { BranchSummaryEntry, SessionManager } from "../session-manager/index.js";
import type { ModelController } from "./model-controller.js";
import type { QueueController } from "./queue-controller.js";
import type { SessionContext } from "./session-context.js";
import { extractUserMessageText } from "./session-stats.js";

export class SessionNavigator {
	// Branch summarization state
	private _branchSummaryAbortController: AbortController | undefined = undefined;

	constructor(
		private readonly ctx: SessionContext,
		private readonly queue: QueueController,
		private readonly model: ModelController,
	) {}

	/** Cancel in-progress branch summarization. */
	abortBranchSummary(): void {
		this._branchSummaryAbortController?.abort();
	}

	async newSession(options?: {
		parentSession?: string;
		setup?: (sessionManager: SessionManager) => Promise<void>;
	}): Promise<boolean> {
		const previousSessionFile = this.ctx.sessionManager.getSessionFile();

		// Emit session_before_switch event with reason "new" (can be cancelled)
		if (this.ctx.extensionRunner?.hasHandlers("session_before_switch")) {
			const result = (await this.ctx.extensionRunner.emit({
				type: "session_before_switch",
				reason: "new",
			})) as SessionBeforeSwitchResult | undefined;

			if (result?.cancel) {
				return false;
			}
		}

		this.ctx.disconnectFromAgent();
		await this.ctx.abort();
		// Outgoing session ends because the host is opening a new one.
		await this.ctx.hookRuntime.runSessionEnd("new_session");
		this.ctx.agent.reset();
		this.ctx.sessionManager.newSession({ parentSession: options?.parentSession });
		this.ctx.agent.sessionId = this.ctx.sessionManager.getSessionId();
		this.queue.reset();

		this.ctx.sessionManager.appendThinkingLevelChange(this.ctx.agent.state.thinkingLevel);

		// Run setup callback if provided (e.g., to append initial messages)
		if (options?.setup) {
			await options.setup(this.ctx.sessionManager);
			// Sync agent state with session manager after setup
			const sessionContext = this.ctx.sessionManager.buildSessionContext();
			this.ctx.agent.replaceMessages(sessionContext.messages);
		}

		this.ctx.reconnectToAgent();

		// Emit session_switch event with reason "new" to extensions
		if (this.ctx.extensionRunner) {
			await this.ctx.extensionRunner.emit({
				type: "session_switch",
				reason: "new",
				previousSessionFile,
			});
		}
		this.ctx.hookRuntime.markSessionStart("clear");

		return true;
	}

	/**
	 * Switch to a different session file.
	 * Aborts current operation, loads messages, restores model/thinking.
	 * @returns true if switch completed, false if cancelled by extension
	 */
	async switchSession(sessionPath: string): Promise<boolean> {
		const previousSessionFile = this.ctx.sessionManager.getSessionFile();

		// Emit session_before_switch event (can be cancelled)
		if (this.ctx.extensionRunner?.hasHandlers("session_before_switch")) {
			const result = (await this.ctx.extensionRunner.emit({
				type: "session_before_switch",
				reason: "resume",
				targetSessionFile: sessionPath,
			})) as SessionBeforeSwitchResult | undefined;

			if (result?.cancel) {
				return false;
			}
		}

		this.ctx.disconnectFromAgent();
		await this.ctx.abort();
		this.queue.reset();
		// Leave current session for another existing session file.
		await this.ctx.hookRuntime.runSessionEnd("switch_session");

		// Set new session
		this.ctx.sessionManager.setSessionFile(sessionPath);
		this.ctx.agent.sessionId = this.ctx.sessionManager.getSessionId();

		// Reload messages
		const sessionContext = this.ctx.sessionManager.buildSessionContext();

		// Emit session_switch event to extensions
		if (this.ctx.extensionRunner) {
			await this.ctx.extensionRunner.emit({
				type: "session_switch",
				reason: "resume",
				previousSessionFile,
			});
		}

		this.ctx.agent.replaceMessages(sessionContext.messages);

		// Restore model if saved
		if (sessionContext.model) {
			const previousModel = this.ctx.model;
			const storedProvider = sessionContext.model.provider;
			const storedId = sessionContext.model.modelId;
			const availableModels = await this.ctx.modelRegistry.getAvailable();
			// 先按 id(=路由 key) 精确匹配；匹配不到再按上游真名 modelId 兜底(兼容老会话)
			const match =
				availableModels.find((m) => m.provider === storedProvider && m.id === storedId) ??
				availableModels.find((m) => m.provider === storedProvider && m.modelId === storedId);
			if (match) {
				this.ctx.agent.setModel(match);
				await this.model.emitModelSelect(match, previousModel, "restore");
				// 走 modelId 兜底命中(id !== storedId)：把会话存储里的标识静默升级为精确 key
				if (match.id !== storedId) {
					this.ctx.sessionManager.appendModelChange(match.provider, match.id);
				}
			}
		}

		const hasThinkingEntry = this.ctx.sessionManager
			.getBranch()
			.some((entry) => entry.type === "thinking_level_change");
		const defaultThinkingLevel = this.ctx.settingsManager.getDefaultThinkingLevel() ?? DEFAULT_THINKING_LEVEL;

		if (hasThinkingEntry) {
			// Restore thinking level if saved (setThinkingLevel clamps to model capabilities)
			this.model.setThinkingLevel(sessionContext.thinkingLevel as ThinkingLevel);
		} else {
			const availableLevels = this.model.getAvailableThinkingLevels();
			const effectiveLevel = availableLevels.includes(defaultThinkingLevel)
				? defaultThinkingLevel
				: this.model.clampThinkingLevel(defaultThinkingLevel, availableLevels);
			this.ctx.agent.setThinkingLevel(effectiveLevel);
			this.ctx.sessionManager.appendThinkingLevelChange(effectiveLevel);
		}

		this.ctx.reconnectToAgent();
		this.ctx.hookRuntime.markSessionStart("resume");
		return true;
	}

	/**
	 * Create a fork from a specific entry.
	 * @param entryId ID of the entry to fork from
	 * @returns selectedText (for editor pre-fill) and cancelled (true if an extension cancelled)
	 */
	async fork(entryId: string): Promise<{ selectedText: string; cancelled: boolean }> {
		const previousSessionFile = this.ctx.sessionManager.getSessionFile();
		const selectedEntry = this.ctx.sessionManager.getEntry(entryId);

		if (!selectedEntry || selectedEntry.type !== "message" || selectedEntry.message.role !== "user") {
			throw new Error("Invalid entry ID for forking");
		}

		const selectedText = extractUserMessageText(selectedEntry.message.content);

		let skipConversationRestore = false;

		// Emit session_before_fork event (can be cancelled)
		if (this.ctx.extensionRunner?.hasHandlers("session_before_fork")) {
			const result = (await this.ctx.extensionRunner.emit({
				type: "session_before_fork",
				entryId,
			})) as SessionBeforeForkResult | undefined;

			if (result?.cancel) {
				return { selectedText, cancelled: true };
			}
			skipConversationRestore = result?.skipConversationRestore ?? false;
		}

		// Clear pending messages (bound to old session state)
		this.queue.resetNextTurn();
		await this.ctx.hookRuntime.runSessionEnd("fork_session");

		if (!selectedEntry.parentId) {
			this.ctx.sessionManager.newSession({ parentSession: previousSessionFile });
		} else {
			this.ctx.sessionManager.createBranchedSession(selectedEntry.parentId);
		}
		this.ctx.agent.sessionId = this.ctx.sessionManager.getSessionId();

		// Reload messages from entries (works for both file and in-memory mode)
		const sessionContext = this.ctx.sessionManager.buildSessionContext();

		// Emit session_fork event to extensions (after fork completes)
		if (this.ctx.extensionRunner) {
			await this.ctx.extensionRunner.emit({
				type: "session_fork",
				previousSessionFile,
			});
		}

		if (!skipConversationRestore) {
			this.ctx.agent.replaceMessages(sessionContext.messages);
		}
		this.ctx.hookRuntime.markSessionStart("clear");

		return { selectedText, cancelled: false };
	}

	/**
	 * Navigate to a different node in the session tree.
	 * Unlike fork() which creates a new session file, this stays in the same file.
	 */
	async navigateTree(
		targetId: string,
		options: { summarize?: boolean; customInstructions?: string; replaceInstructions?: boolean; label?: string } = {},
	): Promise<{ editorText?: string; cancelled: boolean; aborted?: boolean; summaryEntry?: BranchSummaryEntry }> {
		const oldLeafId = this.ctx.sessionManager.getLeafId();

		// No-op if already at target
		if (targetId === oldLeafId) {
			return { cancelled: false };
		}

		// Model required for summarization
		if (options.summarize && !this.ctx.model) {
			throw new Error("No model available for summarization");
		}

		const targetEntry = this.ctx.sessionManager.getEntry(targetId);
		if (!targetEntry) {
			throw new Error(`Entry ${targetId} not found`);
		}

		// Collect entries to summarize (from old leaf to common ancestor)
		const { entries: entriesToSummarize, commonAncestorId } = collectEntriesForBranchSummary(
			this.ctx.sessionManager,
			oldLeafId,
			targetId,
		);

		// Prepare event data - mutable so extensions can override
		let customInstructions = options.customInstructions;
		let replaceInstructions = options.replaceInstructions;
		let label = options.label;

		const preparation: TreePreparation = {
			targetId,
			oldLeafId,
			commonAncestorId,
			entriesToSummarize,
			userWantsSummary: options.summarize ?? false,
			customInstructions,
			replaceInstructions,
			label,
		};

		// Set up abort controller for summarization
		this._branchSummaryAbortController = new AbortController();
		let extensionSummary: { summary: string; details?: unknown } | undefined;
		let fromExtension = false;

		// Emit session_before_tree event
		if (this.ctx.extensionRunner?.hasHandlers("session_before_tree")) {
			const result = (await this.ctx.extensionRunner.emit({
				type: "session_before_tree",
				preparation,
				signal: this._branchSummaryAbortController.signal,
			})) as SessionBeforeTreeResult | undefined;

			if (result?.cancel) {
				return { cancelled: true };
			}

			if (result?.summary && options.summarize) {
				extensionSummary = result.summary;
				fromExtension = true;
			}

			// Allow extensions to override instructions and label
			if (result?.customInstructions !== undefined) {
				customInstructions = result.customInstructions;
			}
			if (result?.replaceInstructions !== undefined) {
				replaceInstructions = result.replaceInstructions;
			}
			if (result?.label !== undefined) {
				label = result.label;
			}
		}

		// Run default summarizer if needed
		let summaryText: string | undefined;
		let summaryDetails: unknown;
		if (options.summarize && entriesToSummarize.length > 0 && !extensionSummary) {
			const model = this.ctx.model!;
			const apiKey = await this.ctx.modelRegistry.getApiKey(model);
			if (!apiKey) {
				throw new Error(`No API key for ${model.provider}`);
			}
			const branchSummarySettings = this.ctx.settingsManager.getBranchSummarySettings();
			const result = await generateBranchSummary(entriesToSummarize, {
				model,
				apiKey,
				signal: this._branchSummaryAbortController.signal,
				customInstructions,
				replaceInstructions,
				reserveTokens: branchSummarySettings.reserveTokens,
			});
			this._branchSummaryAbortController = undefined;
			if (result.aborted) {
				return { cancelled: true, aborted: true };
			}
			if (result.error) {
				throw new Error(result.error);
			}
			summaryText = result.summary;
			summaryDetails = {
				readFiles: result.readFiles || [],
				modifiedFiles: result.modifiedFiles || [],
			};
		} else if (extensionSummary) {
			summaryText = extensionSummary.summary;
			summaryDetails = extensionSummary.details;
		}

		// Determine the new leaf position based on target type
		let newLeafId: string | null;
		let editorText: string | undefined;

		if (targetEntry.type === "message" && targetEntry.message.role === "user") {
			// User message: leaf = parent (null if root), text goes to editor
			newLeafId = targetEntry.parentId;
			editorText = extractUserMessageText(targetEntry.message.content);
		} else if (targetEntry.type === "custom_message") {
			// Custom message: leaf = parent (null if root), text goes to editor
			newLeafId = targetEntry.parentId;
			editorText =
				typeof targetEntry.content === "string"
					? targetEntry.content
					: targetEntry.content
							.filter((c): c is { type: "text"; text: string } => c.type === "text")
							.map((c) => c.text)
							.join("");
		} else {
			// Non-user message: leaf = selected node
			newLeafId = targetId;
		}

		// Switch leaf (with or without summary)
		// Summary is attached at the navigation target position (newLeafId), not the old branch
		let summaryEntry: BranchSummaryEntry | undefined;
		if (summaryText) {
			// Create summary at target position (can be null for root)
			const summaryId = this.ctx.sessionManager.branchWithSummary(
				newLeafId,
				summaryText,
				summaryDetails,
				fromExtension,
			);
			summaryEntry = this.ctx.sessionManager.getEntry(summaryId) as BranchSummaryEntry;

			// Attach label to the summary entry
			if (label) {
				this.ctx.sessionManager.appendLabelChange(summaryId, label);
			}
		} else if (newLeafId === null) {
			// No summary, navigating to root - reset leaf
			this.ctx.sessionManager.resetLeaf();
		} else {
			// No summary, navigating to non-root
			this.ctx.sessionManager.branch(newLeafId);
		}

		// Attach label to target entry when not summarizing (no summary entry to label)
		if (label && !summaryText) {
			this.ctx.sessionManager.appendLabelChange(targetId, label);
		}

		// Update agent state
		const sessionContext = this.ctx.sessionManager.buildSessionContext();
		this.ctx.agent.replaceMessages(sessionContext.messages);

		// Emit session_tree event
		if (this.ctx.extensionRunner) {
			await this.ctx.extensionRunner.emit({
				type: "session_tree",
				newLeafId: this.ctx.sessionManager.getLeafId(),
				oldLeafId,
				summaryEntry,
				fromExtension: summaryText ? fromExtension : undefined,
			});
		}

		this._branchSummaryAbortController = undefined;
		return { editorText, cancelled: false, summaryEntry };
	}

	/** Get all user messages from session for fork selector. */
	getUserMessagesForForking(): Array<{ entryId: string; text: string }> {
		const entries = this.ctx.sessionManager.getEntries();
		const result: Array<{ entryId: string; text: string }> = [];

		for (const entry of entries) {
			if (entry.type !== "message") continue;
			if (entry.message.role !== "user") continue;

			const text = extractUserMessageText(entry.message.content);
			if (text) {
				result.push({ entryId: entry.id, text });
			}
		}

		return result;
	}

	/**
	 * Switch leaf to the tip of the subtree rooted at targetId (same session file).
	 * Unlike navigateTree on a user message, this does not prepare re-edit — it only
	 * changes what history path the agent/UI sees.
	 */
	switchBranch(targetId: string): { leafId: string } {
		const tipId = this.ctx.sessionManager.resolveSubtreeTip(targetId);
		const oldLeafId = this.ctx.sessionManager.getLeafId();
		if (tipId === oldLeafId) {
			return { leafId: tipId };
		}
		this.ctx.sessionManager.branch(tipId);
		const sessionContext = this.ctx.sessionManager.buildSessionContext();
		this.ctx.agent.replaceMessages(sessionContext.messages);
		return { leafId: tipId };
	}

	/**
	 * Export a fork to a new session file without switching the current session.
	 * Copies history through the selected user message **and that turn's assistant
	 * reply** (tools included), but not later user turns.
	 *
	 * Desktop product: forking a user bubble keeps the Q&A pair for that turn.
	 * (CLI `/fork` still uses createBranchedSession(parent) for re-edit semantics.)
	 */
	exportForkToNewFile(entryId: string): { path: string; text: string } {
		const selectedEntry = this.ctx.sessionManager.getEntry(entryId);
		if (!selectedEntry || selectedEntry.type !== "message" || selectedEntry.message.role !== "user") {
			throw new Error("Invalid entry ID for forking");
		}
		const text = extractUserMessageText(selectedEntry.message.content);
		// Leaf = end of this user turn (user + assistant/tool chain), not only the user node.
		const turnTipId = this.ctx.sessionManager.resolveUserTurnTip(entryId);
		// Record the user entry (not the tip) so hosts can jump back to the source bubble.
		const path = this.ctx.sessionManager.exportBranchToNewFile(turnTipId, { parentEntryId: entryId });
		if (!path) {
			throw new Error("Cannot export fork: session is not persisted");
		}
		return { path, text };
	}
}
