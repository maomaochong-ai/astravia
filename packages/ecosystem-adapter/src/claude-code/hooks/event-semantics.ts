import { emptyHandlerOutcome } from "../../hooks/dispatcher.js";
import type { HookCommandResult, HookDispatchEffect, HookHandlerOutcome, HookRequest } from "../../hooks/types.js";
import { type ClaudeOutput, parseClaudeOutput } from "./output-parser.js";

export function interpretClaudeHookResult(request: HookRequest, result: HookCommandResult): HookHandlerOutcome {
	const base = result.error
		? failed(result.error.message)
		: result.exitCode === null
			? failed("hook exited without a status code")
			: interpretByEvent(request, result);
	base.completionOrder = result.completionOrder;
	return base;
}

export function aggregateClaudeHookOutcomes(
	request: HookRequest,
	outcomes: readonly HookHandlerOutcome[],
): HookDispatchEffect {
	const shouldStop = outcomes.some((outcome) => outcome.shouldStop);
	const shouldBlock = !shouldStop && outcomes.some((outcome) => outcome.shouldBlock);
	const blocking = shouldBlock ? outcomes.filter((outcome) => outcome.shouldBlock) : [];
	const permissionDecision = outcomes.some((outcome) => outcome.permissionDecision === "deny")
		? "deny"
		: outcomes.some((outcome) => outcome.permissionDecision === "allow")
			? "allow"
			: undefined;
	const updatedToolInput =
		request.eventName === "PreToolUse" && !shouldStop && !shouldBlock
			? outcomes
					.filter((outcome) => outcome.updatedToolInput !== undefined)
					.sort((left, right) => (left.completionOrder ?? -1) - (right.completionOrder ?? -1))
					.at(-1)?.updatedToolInput
			: undefined;

	return {
		shouldStop,
		stopReason: outcomes.find((outcome) => outcome.stopReason)?.stopReason,
		shouldBlock,
		blockReason: joinNonEmpty(blocking.map((outcome) => outcome.blockReason)),
		additionalContexts: outcomes.flatMap((outcome) => outcome.additionalContexts),
		feedbackMessage: joinNonEmpty(outcomes.flatMap((outcome) => outcome.feedbackMessages)),
		continuationFragments: shouldStop ? [] : blocking.flatMap((outcome) => outcome.continuationFragments),
		updatedToolInput,
		permissionDecision,
		permissionMessage: outcomes.find((outcome) => outcome.permissionDecision === permissionDecision)
			?.permissionMessage,
	};
}

function interpretByEvent(request: HookRequest, result: HookCommandResult): HookHandlerOutcome {
	switch (request.eventName) {
		case "SessionStart":
		case "SubagentStart":
			return interpretStart(request.eventName, result);
		case "SessionEnd":
			return interpretSessionEnd(result);
		case "UserPromptSubmit":
			return interpretUserPromptSubmit(result);
		case "PreToolUse":
			return interpretPreToolUse(result);
		case "PermissionRequest":
			return interpretPermissionRequest(result);
		case "PostToolUse":
			return interpretPostToolUse(result);
		case "PostToolUseFailure":
			return interpretPostToolUseFailure(result);
		case "PreCompact":
			return interpretPreCompact(result);
		case "PostCompact":
			return interpretPostCompact(result);
		case "SubagentStop":
		case "Stop":
			return interpretStop(request.eventName, result);
	}
}

/**
 * Claude SessionStart / SubagentStart: exit 2 is non-blocking (stderr notice only).
 * Plain stdout becomes additional context.
 */
function interpretStart(eventName: "SessionStart" | "SubagentStart", result: HookCommandResult): HookHandlerOutcome {
	if (result.exitCode !== 0) {
		const detail = trimmed(result.stderr) ?? `hook exited with code ${result.exitCode}`;
		return failed(`${eventName} ${detail}`);
	}
	const stdout = result.stdout.trim();
	if (!stdout) return emptyHandlerOutcome();
	if (!looksJsonLike(stdout)) return withContext(stdout);
	const parsed = parseClaudeOutput(eventName, stdout);
	if (!parsed.ok) return failed(parsed.message);
	const outcome = fromUniversal(parsed.value);
	appendContext(outcome, parsed.value.additionalContext);
	return outcome;
}

/** SessionEnd cannot block teardown; non-zero exit is a non-blocking failure. */
function interpretSessionEnd(result: HookCommandResult): HookHandlerOutcome {
	if (result.exitCode !== 0) {
		const detail = trimmed(result.stderr) ?? `hook exited with code ${result.exitCode}`;
		return failed(`SessionEnd ${detail}`);
	}
	const stdout = result.stdout.trim();
	if (!stdout || !looksJsonLike(stdout)) return emptyHandlerOutcome();
	const parsed = parseClaudeOutput("SessionEnd", stdout);
	return parsed.ok ? fromUniversal(parsed.value) : failed(parsed.message);
}

function interpretUserPromptSubmit(result: HookCommandResult): HookHandlerOutcome {
	if (result.exitCode === 2) return blockingExit("UserPromptSubmit", result.stderr, true);
	if (result.exitCode !== 0) return failed(`hook exited with code ${result.exitCode}`);
	const stdout = result.stdout.trim();
	if (!stdout) return emptyHandlerOutcome();
	if (!looksJsonLike(stdout)) return withContext(stdout);
	const parsed = parseClaudeOutput("UserPromptSubmit", stdout);
	if (!parsed.ok) return failed(parsed.message);
	const outcome = fromUniversal(parsed.value);
	appendContext(outcome, parsed.value.additionalContext);
	if (!parsed.value.universal.continueProcessing) return outcome;
	return applyBlockDecision("UserPromptSubmit", parsed.value, true, outcome);
}

function interpretPreToolUse(result: HookCommandResult): HookHandlerOutcome {
	if (result.exitCode === 2) return blockingExit("PreToolUse", result.stderr, false);
	if (result.exitCode !== 0) return failed(`hook exited with code ${result.exitCode}`);
	const stdout = result.stdout.trim();
	if (!stdout || !looksJsonLike(stdout)) return emptyHandlerOutcome();
	const parsed = parseClaudeOutput("PreToolUse", stdout);
	if (!parsed.ok) return failed(parsed.message);
	const output = parsed.value;
	const unsupported = unsupportedPreToolUse(output);
	if (unsupported) return failed(unsupported, warningEntriesFor(output));
	const outcome = { ...emptyHandlerOutcome(), entries: warningEntriesFor(output) };
	appendContext(outcome, output.additionalContext);

	if (output.hasSpecificDecisionFields) {
		if (output.permissionDecision === "deny") {
			return blocked(trimmed(output.permissionDecisionReason) ?? "PreToolUse hook denied tool execution", outcome);
		}
		if (output.permissionDecision === "allow") {
			if (output.updatedInput !== undefined) outcome.updatedToolInput = output.updatedInput;
			return outcome;
		}
		// ask/defer are unsupported for first cut; already rejected in unsupportedPreToolUse
		return outcome;
	}
	return applyBlockDecision("PreToolUse", output, false, outcome);
}

function interpretPermissionRequest(result: HookCommandResult): HookHandlerOutcome {
	if (result.exitCode === 2) {
		const reason = trimmed(result.stderr);
		return reason ? permission("deny", reason) : failed("PermissionRequest hook exited with code 2 without a reason");
	}
	if (result.exitCode !== 0) return failed(`hook exited with code ${result.exitCode}`);
	const stdout = result.stdout.trim();
	if (!stdout || !looksJsonLike(stdout)) return emptyHandlerOutcome();
	const parsed = parseClaudeOutput("PermissionRequest", stdout);
	if (!parsed.ok) return failed(parsed.message);
	const output = parsed.value;
	if (output.permissionInterrupt) {
		return failed("PermissionRequest hook returned unsupported interrupt:true", warningEntriesFor(output));
	}
	if (!output.permissionBehavior) return { ...emptyHandlerOutcome(), entries: warningEntriesFor(output) };
	return permission(output.permissionBehavior, output.permissionMessage, warningEntriesFor(output));
}

function interpretPostToolUse(result: HookCommandResult): HookHandlerOutcome {
	// Claude: exit 2 does not reverse the tool; feedback only
	if (result.exitCode === 2) {
		const feedback = trimmed(result.stderr);
		return feedback
			? {
					...emptyHandlerOutcome(),
					status: "Completed",
					feedbackMessages: [feedback],
					entries: [{ kind: "Feedback", text: feedback }],
				}
			: failed("PostToolUse hook exited with code 2 without feedback");
	}
	if (result.exitCode !== 0) return failed(`hook exited with code ${result.exitCode}`);
	const stdout = result.stdout.trim();
	if (!stdout || !looksJsonLike(stdout)) return emptyHandlerOutcome();
	const parsed = parseClaudeOutput("PostToolUse", stdout);
	if (!parsed.ok) return failed(parsed.message);
	const output = parsed.value;
	const outcome = { ...emptyHandlerOutcome(), entries: warningEntriesFor(output) };
	appendContext(outcome, output.additionalContext);
	if (!output.universal.continueProcessing) {
		return stopped(trimmed(output.universal.stopReason) ?? "PostToolUse hook stopped execution", outcome);
	}
	if (output.decision === "block") {
		const reason = trimmed(output.reason) ?? "PostToolUse hook blocked processing";
		return {
			...outcome,
			status: "Blocked",
			shouldBlock: true,
			blockReason: reason,
			feedbackMessages: [...outcome.feedbackMessages, reason],
			entries: [...outcome.entries, { kind: "Feedback", text: reason }],
		};
	}
	return outcome;
}

/**
 * PostToolUseFailure: tool already failed. Exit 2 surfaces stderr to the model as feedback.
 * JSON may supply additionalContext; cannot reverse the failure.
 */
function interpretPostToolUseFailure(result: HookCommandResult): HookHandlerOutcome {
	if (result.exitCode === 2) {
		const feedback = trimmed(result.stderr);
		return feedback
			? {
					...emptyHandlerOutcome(),
					status: "Completed",
					feedbackMessages: [feedback],
					entries: [{ kind: "Feedback", text: feedback }],
				}
			: failed("PostToolUseFailure hook exited with code 2 without feedback");
	}
	if (result.exitCode !== 0) return failed(`hook exited with code ${result.exitCode}`);
	const stdout = result.stdout.trim();
	if (!stdout || !looksJsonLike(stdout)) return emptyHandlerOutcome();
	const parsed = parseClaudeOutput("PostToolUseFailure", stdout);
	if (!parsed.ok) return failed(parsed.message);
	const outcome = { ...emptyHandlerOutcome(), entries: warningEntriesFor(parsed.value) };
	appendContext(outcome, parsed.value.additionalContext);
	return outcome;
}

function interpretPreCompact(result: HookCommandResult): HookHandlerOutcome {
	if (result.exitCode === 2) return blockingExit("PreCompact", result.stderr, false);
	if (result.exitCode !== 0) return failed(`hook exited with code ${result.exitCode}`);
	const stdout = result.stdout.trim();
	if (!stdout || !looksJsonLike(stdout)) return emptyHandlerOutcome();
	const parsed = parseClaudeOutput("PreCompact", stdout);
	if (!parsed.ok) return failed(parsed.message);
	const outcome = fromUniversal(parsed.value);
	if (!parsed.value.universal.continueProcessing) return outcome;
	return applyBlockDecision("PreCompact", parsed.value, false, outcome);
}

function interpretPostCompact(result: HookCommandResult): HookHandlerOutcome {
	if (result.exitCode !== 0) return failed(`hook exited with code ${result.exitCode}`);
	const stdout = result.stdout.trim();
	if (!stdout || !looksJsonLike(stdout)) return emptyHandlerOutcome();
	const parsed = parseClaudeOutput("PostCompact", stdout);
	return parsed.ok ? fromUniversal(parsed.value) : failed(parsed.message);
}

function interpretStop(eventName: "Stop" | "SubagentStop", result: HookCommandResult): HookHandlerOutcome {
	if (result.exitCode === 2) return blockingExit(eventName, result.stderr, false, true);
	if (result.exitCode !== 0) return failed(`hook exited with code ${result.exitCode}`);
	const stdout = result.stdout.trim();
	if (!stdout) return emptyHandlerOutcome();
	if (!looksJsonLike(stdout)) return emptyHandlerOutcome();
	const parsed = parseClaudeOutput(eventName, stdout);
	if (!parsed.ok) return failed(parsed.message);
	const outcome = fromUniversal(parsed.value);
	appendContext(outcome, parsed.value.additionalContext);
	if (!parsed.value.universal.continueProcessing) return outcome;
	return applyBlockDecision(eventName, parsed.value, false, outcome, true);
}

function unsupportedPreToolUse(output: ClaudeOutput): string | undefined {
	if (output.permissionDecision === "ask") return "PreToolUse hook returned unsupported permissionDecision:ask";
	if (output.permissionDecision === "defer") return "PreToolUse hook returned unsupported permissionDecision:defer";
	if (output.decision === "approve") return "PreToolUse hook returned unsupported decision:approve";
	if (output.hasSpecificDecisionFields) {
		if (output.permissionDecision === "deny" && !trimmed(output.permissionDecisionReason)) {
			return "PreToolUse hook returned permissionDecision:deny without a non-empty reason";
		}
	}
	return validateBlockReason("PreToolUse", output);
}

function applyBlockDecision(
	eventName: string,
	output: ClaudeOutput,
	stopOnBlock: boolean,
	base: HookHandlerOutcome,
	continuation = false,
): HookHandlerOutcome {
	const invalid = validateBlockReason(eventName, output);
	if (invalid) return failed(invalid, base.entries);
	if (output.decision !== "block") return base;
	const reason = trimmed(output.reason) ?? `${eventName} hook blocked processing`;
	if (stopOnBlock) return stopped(reason, base);
	return blocked(reason, base, continuation);
}

function validateBlockReason(eventName: string, output: ClaudeOutput): string | undefined {
	if (output.decision === "block" && !trimmed(output.reason)) {
		return `${eventName} hook returned decision:block without a non-empty reason`;
	}
	return undefined;
}

function fromUniversal(output: ClaudeOutput): HookHandlerOutcome {
	const entries = warningEntriesFor(output);
	if (!output.universal.continueProcessing) {
		return stopped(trimmed(output.universal.stopReason), { ...emptyHandlerOutcome(), entries });
	}
	return { ...emptyHandlerOutcome(), entries };
}

function warningEntriesFor(output: ClaudeOutput): HookHandlerOutcome["entries"] {
	const message = trimmed(output.universal.systemMessage);
	return message ? [{ kind: "Warning", text: message }] : [];
}

function blocked(reason: string, base: HookHandlerOutcome, continuation = false): HookHandlerOutcome {
	return {
		...base,
		status: "Blocked",
		shouldBlock: true,
		blockReason: reason,
		feedbackMessages: [...base.feedbackMessages, reason],
		continuationFragments: continuation ? [...base.continuationFragments, reason] : base.continuationFragments,
		entries: [...base.entries, { kind: "Feedback", text: reason }],
	};
}

function stopped(reason: string | undefined, base: HookHandlerOutcome): HookHandlerOutcome {
	return {
		...base,
		status: "Stopped",
		shouldStop: true,
		stopReason: reason,
		entries: reason ? [...base.entries, { kind: "Stop", text: reason }] : base.entries,
	};
}

function blockingExit(
	eventName: string,
	stderr: string,
	stopOnBlock: boolean,
	continuation = false,
): HookHandlerOutcome {
	const reason = trimmed(stderr);
	if (!reason) return failed(`${eventName} hook exited with code 2 without a reason`);
	return stopOnBlock ? stopped(reason, emptyHandlerOutcome()) : blocked(reason, emptyHandlerOutcome(), continuation);
}

function permission(
	decision: "allow" | "deny",
	message?: string,
	entries: HookHandlerOutcome["entries"] = [],
): HookHandlerOutcome {
	const reason = decision === "deny" ? (trimmed(message) ?? "PermissionRequest hook denied approval") : message;
	return {
		...emptyHandlerOutcome(),
		status: decision === "deny" ? "Blocked" : "Completed",
		entries: decision === "deny" && reason ? [...entries, { kind: "Feedback", text: reason }] : entries,
		permissionDecision: decision,
		permissionMessage: reason,
	};
}

function appendContext(outcome: HookHandlerOutcome, value: string | undefined): void {
	const context = trimmed(value);
	if (!context) return;
	outcome.additionalContexts.push(context);
	outcome.entries.push({ kind: "Context", text: context });
}

function withContext(context: string): HookHandlerOutcome {
	const outcome = emptyHandlerOutcome();
	appendContext(outcome, context);
	return outcome;
}

function failed(message: string, entries: HookHandlerOutcome["entries"] = []): HookHandlerOutcome {
	return { ...emptyHandlerOutcome(), status: "Failed", entries: [...entries, { kind: "Error", text: message }] };
}

function trimmed(value: string | undefined): string | undefined {
	const result = value?.trim();
	return result ? result : undefined;
}

function looksJsonLike(value: string): boolean {
	return value.startsWith("{") || value.startsWith("[");
}

function joinNonEmpty(values: readonly (string | undefined)[]): string | undefined {
	const filtered = values.filter((value): value is string => value !== undefined && value.length > 0);
	return filtered.length > 0 ? filtered.join("\n\n") : undefined;
}
