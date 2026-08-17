import type { ZodType } from "zod";
import type { HookEventName } from "../../hooks/types.js";
import {
	compactOutputSchema,
	permissionRequestOutputSchema,
	postToolUseFailureOutputSchema,
	postToolUseOutputSchema,
	preToolUseOutputSchema,
	sessionEndOutputSchema,
	sessionStartOutputSchema,
	stopOutputSchema,
	subagentStartOutputSchema,
	userPromptSubmitOutputSchema,
} from "./output-schemas.js";

export interface ClaudeUniversalOutput {
	continueProcessing: boolean;
	stopReason?: string;
	suppressOutput: boolean;
	systemMessage?: string;
}

export interface ClaudeOutput {
	universal: ClaudeUniversalOutput;
	decision?: "approve" | "block";
	reason?: string;
	additionalContext?: string;
	permissionDecision?: "allow" | "deny" | "ask" | "defer";
	permissionDecisionReason?: string;
	updatedInput?: unknown;
	updatedMcpToolOutput?: unknown;
	permissionBehavior?: "allow" | "deny";
	permissionMessage?: string;
	permissionInterrupt: boolean;
	permissionUpdatedInput?: unknown;
	permissionUpdatedPermissions?: unknown;
	hasSpecificDecisionFields: boolean;
}

export type ClaudeOutputParseResult = { ok: true; value: ClaudeOutput } | { ok: false; message: string };

interface UniversalWireOutput {
	continue?: boolean;
	stopReason?: string | null;
	suppressOutput?: boolean;
	systemMessage?: string | null;
}

export function parseClaudeOutput(eventName: HookEventName, stdout: string): ClaudeOutputParseResult {
	let root: unknown;
	try {
		root = JSON.parse(stdout.trim()) as unknown;
	} catch {
		return invalid(eventName);
	}

	switch (eventName) {
		case "SessionStart":
			return parseWithSchema(eventName, sessionStartOutputSchema, root, (wire) => {
				const output = fromUniversal(wire);
				output.additionalContext = optionalString(wire.hookSpecificOutput?.additionalContext);
				return output;
			});
		case "SessionEnd":
			return parseWithSchema(eventName, sessionEndOutputSchema, root, (wire) => {
				const output = fromUniversal(wire);
				output.additionalContext = optionalString(wire.hookSpecificOutput?.additionalContext);
				return output;
			});
		case "SubagentStart":
			return parseWithSchema(eventName, subagentStartOutputSchema, root, (wire) => {
				const output = fromUniversal(wire);
				output.additionalContext = optionalString(wire.hookSpecificOutput?.additionalContext);
				return output;
			});
		case "UserPromptSubmit":
			return parseWithSchema(eventName, userPromptSubmitOutputSchema, root, (wire) => {
				const output = fromUniversal(wire);
				output.decision = wire.decision ?? undefined;
				output.reason = optionalString(wire.reason);
				output.additionalContext = optionalString(wire.hookSpecificOutput?.additionalContext);
				return output;
			});
		case "PreToolUse":
			return parseWithSchema(eventName, preToolUseOutputSchema, root, (wire) => {
				const output = fromUniversal(wire);
				const specific = wire.hookSpecificOutput;
				output.decision = wire.decision ?? undefined;
				output.reason = optionalString(wire.reason);
				output.additionalContext = optionalString(specific?.additionalContext);
				output.permissionDecision = specific?.permissionDecision ?? undefined;
				output.permissionDecisionReason = optionalString(specific?.permissionDecisionReason);
				output.updatedInput = optionalValue(specific?.updatedInput);
				output.hasSpecificDecisionFields =
					specific !== undefined &&
					specific !== null &&
					(specific.permissionDecision != null ||
						specific.permissionDecisionReason != null ||
						optionalValue(specific.updatedInput) !== undefined);
				return output;
			});
		case "PermissionRequest":
			return parseWithSchema(eventName, permissionRequestOutputSchema, root, (wire) => {
				const output = fromUniversal(wire);
				const decision = wire.hookSpecificOutput?.decision;
				output.permissionBehavior = decision?.behavior;
				output.permissionMessage = optionalString(decision?.message);
				output.permissionInterrupt = decision?.interrupt ?? false;
				output.permissionUpdatedInput = optionalValue(decision?.updatedInput);
				output.permissionUpdatedPermissions = optionalValue(decision?.updatedPermissions);
				return output;
			});
		case "PostToolUse":
			return parseWithSchema(eventName, postToolUseOutputSchema, root, (wire) => {
				const output = fromUniversal(wire);
				output.decision = wire.decision ?? undefined;
				output.reason = optionalString(wire.reason);
				output.additionalContext = optionalString(wire.hookSpecificOutput?.additionalContext);
				output.updatedMcpToolOutput = optionalValue(wire.hookSpecificOutput?.updatedMCPToolOutput);
				return output;
			});
		case "PostToolUseFailure":
			return parseWithSchema(eventName, postToolUseFailureOutputSchema, root, (wire) => {
				const output = fromUniversal(wire);
				output.additionalContext = optionalString(wire.hookSpecificOutput?.additionalContext);
				return output;
			});
		case "PreCompact":
		case "PostCompact":
			return parseWithSchema(eventName, compactOutputSchema, root, fromUniversal);
		case "SubagentStop":
		case "Stop":
			return parseWithSchema(eventName, stopOutputSchema, root, (wire) => {
				const output = fromUniversal(wire);
				output.decision = wire.decision ?? undefined;
				output.reason = optionalString(wire.reason);
				output.additionalContext = optionalString(wire.hookSpecificOutput?.additionalContext);
				return output;
			});
	}
}

function parseWithSchema<T extends UniversalWireOutput>(
	eventName: HookEventName,
	schema: ZodType<T>,
	root: unknown,
	map: (wire: T) => ClaudeOutput,
): ClaudeOutputParseResult {
	const result = schema.safeParse(root);
	return result.success ? { ok: true, value: map(result.data) } : invalid(eventName);
}

function fromUniversal(wire: UniversalWireOutput): ClaudeOutput {
	return {
		universal: {
			continueProcessing: wire.continue ?? true,
			stopReason: optionalString(wire.stopReason),
			suppressOutput: wire.suppressOutput ?? false,
			systemMessage: optionalString(wire.systemMessage),
		},
		permissionInterrupt: false,
		hasSpecificDecisionFields: false,
	};
}

function invalid(eventName: HookEventName): ClaudeOutputParseResult {
	return { ok: false, message: `hook returned invalid ${eventName} JSON output` };
}

function optionalString(value: string | null | undefined): string | undefined {
	return value ?? undefined;
}

function optionalValue(value: unknown): unknown {
	return value === null ? undefined : value;
}
