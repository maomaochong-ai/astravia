/**
 * Bash execution controller.
 *
 * Extracted from AgentSession. Owns the bash abort controller and the
 * pending-message queue used to preserve tool_use/tool_result ordering when a
 * bash result lands mid-stream.
 */

import { type BashResult, executeBash as executeBashCommand, executeBashWithOperations } from "../bash-executor.js";
import type { BashExecutionMessage } from "../messages.js";
import type { BashOperations } from "../tools/bash/index.js";
import type { SessionContext } from "./session-context.js";

export class BashController {
	private _bashAbortController: AbortController | undefined = undefined;
	private _pendingBashMessages: BashExecutionMessage[] = [];

	constructor(private readonly ctx: SessionContext) {}

	/**
	 * Execute a bash command.
	 * Adds result to agent context and session.
	 * @param command The bash command to execute
	 * @param onChunk Optional streaming callback for output
	 * @param options.excludeFromContext If true, command output won't be sent to LLM (!! prefix)
	 * @param options.operations Custom BashOperations for remote execution
	 */
	async executeBash(
		command: string,
		onChunk?: (chunk: string) => void,
		options?: { excludeFromContext?: boolean; operations?: BashOperations },
	): Promise<BashResult> {
		this._bashAbortController = new AbortController();

		// Apply command prefix if configured (e.g., "shopt -s expand_aliases" for alias support)
		const prefix = this.ctx.settingsManager.getShellCommandPrefix();
		const resolvedCommand = prefix ? `${prefix}\n${command}` : command;

		try {
			const result = options?.operations
				? await executeBashWithOperations(resolvedCommand, process.cwd(), options.operations, {
						onChunk,
						signal: this._bashAbortController.signal,
					})
				: await executeBashCommand(resolvedCommand, {
						onChunk,
						signal: this._bashAbortController.signal,
					});

			this.recordBashResult(command, result, options);
			return result;
		} finally {
			this._bashAbortController = undefined;
		}
	}

	/**
	 * Record a bash execution result in session history.
	 * Used by executeBash and by extensions that handle bash execution themselves.
	 */
	recordBashResult(command: string, result: BashResult, options?: { excludeFromContext?: boolean }): void {
		const bashMessage: BashExecutionMessage = {
			role: "bashExecution",
			command,
			output: result.output,
			exitCode: result.exitCode,
			cancelled: result.cancelled,
			truncated: result.truncated,
			fullOutputPath: result.fullOutputPath,
			timestamp: Date.now(),
			excludeFromContext: options?.excludeFromContext,
		};

		// If agent is streaming, defer adding to avoid breaking tool_use/tool_result ordering
		if (this.ctx.agent.state.isStreaming) {
			// Queue for later - will be flushed on agent_end
			this._pendingBashMessages.push(bashMessage);
		} else {
			// Add to agent state immediately
			this.ctx.agent.appendMessage(bashMessage);

			// Save to session
			this.ctx.sessionManager.appendMessage(bashMessage);
		}
	}

	/** Cancel running bash command. */
	abortBash(): void {
		this._bashAbortController?.abort();
	}

	/** Whether a bash command is currently running. */
	get isBashRunning(): boolean {
		return this._bashAbortController !== undefined;
	}

	/** Whether there are pending bash messages waiting to be flushed. */
	get hasPendingBashMessages(): boolean {
		return this._pendingBashMessages.length > 0;
	}

	/**
	 * Flush pending bash messages to agent state and session.
	 * Called after agent turn completes to maintain proper message ordering.
	 */
	flushPending(): void {
		if (this._pendingBashMessages.length === 0) return;

		for (const bashMessage of this._pendingBashMessages) {
			// Add to agent state
			this.ctx.agent.appendMessage(bashMessage);

			// Save to session
			this.ctx.sessionManager.appendMessage(bashMessage);
		}

		this._pendingBashMessages = [];
	}
}
