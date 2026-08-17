import type { ZodType } from "zod";
import type { HookEventName } from "../../../hooks/types.js";
import {
	compactOutputSchema,
	permissionRequestOutputSchema,
	postToolUseOutputSchema,
	preToolUseOutputSchema,
	sessionStartOutputSchema,
	stopOutputSchema,
	subagentStartOutputSchema,
	userPromptSubmitOutputSchema,
} from "./output-schemas.js";

export interface LatestCodexUniversalOutput {
	continueProcessing: boolean;
	stopReason?: string;
	suppressOutput: boolean;
	systemMessage?: string;
}

export interface LatestCodexOutput {
	universal: LatestCodexUniversalOutput;
	decision?: "approve" | "block";
	reason?: string;
	additionalContext?: string;
	permissionDecision?: "allow" | "deny" | "ask";
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

export type LatestCodexOutputParseResult = { ok: true; value: LatestCodexOutput } | { ok: false; message: string };

interface UniversalWireOutput {
	continue?: boolean;
	stopReason?: string | null;
	suppressOutput?: boolean;
	systemMessage?: string | null;
}

export function parseLatestCodexOutput(eventName: HookEventName, stdout: string): LatestCodexOutputParseResult {
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
		case "SessionEnd":
		case "PostToolUseFailure":
			return invalid(eventName);
		case "PreCompact":
		case "PostCompact":
			return parseWithSchema(eventName, compactOutputSchema, root, fromUniversal);
		case "SubagentStop":
		case "Stop":
			return parseWithSchema(eventName, stopOutputSchema, root, (wire) => {
				const output = fromUniversal(wire);
				output.decision = wire.decision ?? undefined;
				output.reason = optionalString(wire.reason);
				return output;
			});
	}
}

function parseWithSchema<T extends UniversalWireOutput>(
	eventName: HookEventName,
	schema: ZodType<T>,
	root: unknown,
	map: (wire: T) => LatestCodexOutput,
): LatestCodexOutputParseResult {
	const result = schema.safeParse(root);
	return result.success ? { ok: true, value: map(result.data) } : invalid(eventName);
}

function fromUniversal(wire: UniversalWireOutput): LatestCodexOutput {
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

function invalid(eventName: HookEventName): LatestCodexOutputParseResult {
	return { ok: false, message: `hook returned invalid ${eventName} JSON output` };
}

function optionalString(value: string | null | undefined): string | undefined {
	return value ?? undefined;
}

function optionalValue(value: unknown): unknown {
	return value === null ? undefined : value;
}
