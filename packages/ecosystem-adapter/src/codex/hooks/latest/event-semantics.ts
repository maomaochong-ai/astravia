import { emptyHandlerOutcome } from "../../../hooks/dispatcher.js";
import type { HookCommandResult, HookDispatchEffect, HookHandlerOutcome, HookRequest } from "../../../hooks/types.js";
import { type LatestCodexOutput, parseLatestCodexOutput } from "./output-parser.js";

export function interpretLatestCodexHookResult(request: HookRequest, result: HookCommandResult): HookHandlerOutcome {
	const base = result.error
		? failed(result.error.message)
		: result.exitCode === null
			? failed("hook exited without a status code")
			: interpretByEvent(request, result);
	base.completionOrder = result.completionOrder;
	return base;
}

export function aggregateLatestCodexHookOutcomes(
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
		case "PostToolUseFailure":
			return failed(`Codex profile does not support ${request.eventName}`);
		case "UserPromptSubmit":
			return interpretUserPromptSubmit(result);
		case "PreToolUse":
			return interpretPreToolUse(result);
		case "PermissionRequest":
			return interpretPermissionRequest(result);
		case "PostToolUse":
			return interpretPostToolUse(result);
		case "PreCompact":
		case "PostCompact":
			return interpretCompact(request.eventName, result);
		case "SubagentStop":
		case "Stop":
			return interpretStop(request.eventName, result);
	}
}

function interpretStart(eventName: "SessionStart" | "SubagentStart", result: HookCommandResult): HookHandlerOutcome {
	if (result.exitCode !== 0) return failed(`hook exited with code ${result.exitCode}`);
	const stdout = result.stdout.trim();
	if (!stdout) return emptyHandlerOutcome();
	if (!looksJsonLike(stdout)) return withContext(stdout);
	const parsed = parseLatestCodexOutput(eventName, stdout);
	if (!parsed.ok) return failed(parsed.message);
	const outcome = fromUniversal(parsed.value);
	appendContext(outcome, parsed.value.additionalContext);
	return outcome;
}

function interpretUserPromptSubmit(result: HookCommandResult): HookHandlerOutcome {
	if (result.exitCode === 2) return blockingExit("UserPromptSubmit", result.stderr, true);
	if (result.exitCode !== 0) return failed(`hook exited with code ${result.exitCode}`);
	const stdout = result.stdout.trim();
	if (!stdout) return emptyHandlerOutcome();
	if (!looksJsonLike(stdout)) return withContext(stdout);
	const parsed = parseLatestCodexOutput("UserPromptSubmit", stdout);
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
	const parsed = parseLatestCodexOutput("PreToolUse", stdout);
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
		if (output.permissionDecision === "allow") outcome.updatedToolInput = output.updatedInput;
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
	const parsed = parseLatestCodexOutput("PermissionRequest", stdout);
	if (!parsed.ok) return failed(parsed.message);
	const output = parsed.value;
	const unsupported = unsupportedPermissionRequest(output);
	if (unsupported) return failed(unsupported, warningEntriesFor(output));
	if (!output.permissionBehavior) return { ...emptyHandlerOutcome(), entries: warningEntriesFor(output) };
	return permission(output.permissionBehavior, output.permissionMessage, warningEntriesFor(output));
}

function interpretPostToolUse(result: HookCommandResult): HookHandlerOutcome {
	if (result.exitCode === 2) {
		const feedback = trimmed(result.stderr);
		return feedback
			? blocked(feedback, emptyHandlerOutcome())
			: failed("PostToolUse hook exited with code 2 without feedback");
	}
	if (result.exitCode !== 0) return failed(`hook exited with code ${result.exitCode}`);
	const stdout = result.stdout.trim();
	if (!stdout || !looksJsonLike(stdout)) return emptyHandlerOutcome();
	const parsed = parseLatestCodexOutput("PostToolUse", stdout);
	if (!parsed.ok) return failed(parsed.message);
	const output = parsed.value;
	const invalidReason = output.universal.suppressOutput
		? "PostToolUse hook returned unsupported suppressOutput"
		: output.updatedMcpToolOutput !== undefined && output.updatedMcpToolOutput !== null
			? "PostToolUse hook returned unsupported updatedMCPToolOutput"
			: undefined;
	const invalidBlockReason = validateBlockReason("PostToolUse", output);
	const outcome = { ...emptyHandlerOutcome(), entries: warningEntriesFor(output) };

	if (!output.universal.continueProcessing) {
		if (!invalidReason && !invalidBlockReason) appendContext(outcome, output.additionalContext);
		return stoppedPostToolUse(output, outcome);
	}
	if (invalidReason) return failed(invalidReason, outcome.entries);
	if (invalidBlockReason) return failed(invalidBlockReason, outcome.entries);
	appendContext(outcome, output.additionalContext);
	return output.decision === "block"
		? blocked(trimmed(output.reason) ?? "PostToolUse hook blocked processing", outcome)
		: outcome;
}

function interpretCompact(eventName: "PreCompact" | "PostCompact", result: HookCommandResult): HookHandlerOutcome {
	if (result.exitCode !== 0) return failed(`hook exited with code ${result.exitCode}`);
	const stdout = result.stdout.trim();
	if (!stdout || !looksJsonLike(stdout)) return emptyHandlerOutcome();
	const parsed = parseLatestCodexOutput(eventName, stdout);
	return parsed.ok ? fromUniversal(parsed.value) : failed(parsed.message);
}

function interpretStop(eventName: "Stop" | "SubagentStop", result: HookCommandResult): HookHandlerOutcome {
	if (result.exitCode === 2) return blockingExit(eventName, result.stderr, false, true);
	if (result.exitCode !== 0) return failed(`hook exited with code ${result.exitCode}`);
	const stdout = result.stdout.trim();
	if (!stdout) return emptyHandlerOutcome();
	const parsed = parseLatestCodexOutput(eventName, stdout);
	if (!parsed.ok) return failed(parsed.message);
	const outcome = fromUniversal(parsed.value);
	if (!parsed.value.universal.continueProcessing) return outcome;
	return applyBlockDecision(eventName, parsed.value, false, outcome, true);
}

function unsupportedPreToolUse(output: LatestCodexOutput): string | undefined {
	if (!output.universal.continueProcessing) return "PreToolUse hook returned unsupported continue:false";
	if (output.universal.stopReason !== undefined) return "PreToolUse hook returned unsupported stopReason";
	if (output.universal.suppressOutput) return "PreToolUse hook returned unsupported suppressOutput";
	if (output.hasSpecificDecisionFields) {
		if (output.updatedInput !== undefined && output.permissionDecision !== "allow") {
			return "PreToolUse hook returned updatedInput without permissionDecision:allow";
		}
		if (output.permissionDecision === "allow" && output.updatedInput === undefined) {
			return "PreToolUse hook returned unsupported permissionDecision:allow";
		}
		if (output.permissionDecision === "ask") return "PreToolUse hook returned unsupported permissionDecision:ask";
		if (output.permissionDecision === "deny" && !trimmed(output.permissionDecisionReason)) {
			return "PreToolUse hook returned permissionDecision:deny without a non-empty reason";
		}
		if (!output.permissionDecision && output.permissionDecisionReason !== undefined) {
			return "PreToolUse hook returned reason without permissionDecision";
		}
		return undefined;
	}
	if (output.decision === "approve") return "PreToolUse hook returned unsupported decision:approve";
	return validateBlockReason("PreToolUse", output);
}

function unsupportedPermissionRequest(output: LatestCodexOutput): string | undefined {
	if (!output.universal.continueProcessing) return "PermissionRequest hook returned unsupported continue:false";
	if (output.universal.stopReason !== undefined) return "PermissionRequest hook returned unsupported stopReason";
	if (output.universal.suppressOutput) return "PermissionRequest hook returned unsupported suppressOutput";
	if (output.permissionUpdatedInput !== undefined) return "PermissionRequest hook returned unsupported updatedInput";
	if (output.permissionUpdatedPermissions !== undefined)
		return "PermissionRequest hook returned unsupported updatedPermissions";
	if (output.permissionInterrupt) return "PermissionRequest hook returned unsupported interrupt:true";
	return undefined;
}

function applyBlockDecision(
	eventName: string,
	output: LatestCodexOutput,
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

function validateBlockReason(eventName: string, output: LatestCodexOutput): string | undefined {
	if (output.decision === "block" && !trimmed(output.reason)) {
		return `${eventName} hook returned decision:block without a non-empty reason`;
	}
	if (
		output.decision !== "block" &&
		output.reason !== undefined &&
		(eventName === "PreToolUse" || eventName === "PostToolUse")
	) {
		return `${eventName} hook returned reason without decision`;
	}
	return undefined;
}

function fromUniversal(output: LatestCodexOutput): HookHandlerOutcome {
	const entries = warningEntriesFor(output);
	if (!output.universal.continueProcessing) {
		return stopped(trimmed(output.universal.stopReason), { ...emptyHandlerOutcome(), entries });
	}
	return { ...emptyHandlerOutcome(), entries };
}

function warningEntriesFor(output: LatestCodexOutput): HookHandlerOutcome["entries"] {
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

function stoppedPostToolUse(output: LatestCodexOutput, base: HookHandlerOutcome): HookHandlerOutcome {
	const stopText = trimmed(output.universal.stopReason) ?? "PostToolUse hook stopped execution";
	const feedback = trimmed(output.reason) ?? stopText;
	return {
		...base,
		status: "Stopped",
		feedbackMessages: [...base.feedbackMessages, feedback],
		entries: [...base.entries, { kind: "Stop", text: stopText }],
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
