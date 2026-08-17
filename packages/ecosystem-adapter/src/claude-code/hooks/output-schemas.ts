import { z } from "zod";

const optionalString = z.string().nullable().optional();
const optionalValue = z.unknown().nullable().optional();

const universalShape = {
	continue: z.boolean().optional(),
	stopReason: optionalString,
	suppressOutput: z.boolean().optional(),
	systemMessage: optionalString,
};

function additionalContextOutput(
	eventName:
		| "SessionStart"
		| "SessionEnd"
		| "SubagentStart"
		| "UserPromptSubmit"
		| "PostToolUse"
		| "PostToolUseFailure"
		| "Stop"
		| "SubagentStop",
) {
	return z
		.object({
			hookEventName: z.literal(eventName),
			additionalContext: optionalString,
		})
		.passthrough();
}

export const sessionStartOutputSchema = z
	.object({
		...universalShape,
		hookSpecificOutput: additionalContextOutput("SessionStart").nullable().optional(),
	})
	.passthrough();

export const sessionEndOutputSchema = z
	.object({
		...universalShape,
		hookSpecificOutput: additionalContextOutput("SessionEnd").nullable().optional(),
	})
	.passthrough();

export const subagentStartOutputSchema = z
	.object({
		...universalShape,
		hookSpecificOutput: additionalContextOutput("SubagentStart").nullable().optional(),
	})
	.passthrough();

export const userPromptSubmitOutputSchema = z
	.object({
		...universalShape,
		decision: z.literal("block").nullable().optional(),
		reason: optionalString,
		hookSpecificOutput: additionalContextOutput("UserPromptSubmit").nullable().optional(),
	})
	.passthrough();

export const preToolUseOutputSchema = z
	.object({
		...universalShape,
		decision: z.enum(["approve", "block"]).nullable().optional(),
		reason: optionalString,
		hookSpecificOutput: z
			.object({
				hookEventName: z.literal("PreToolUse"),
				permissionDecision: z.enum(["allow", "deny", "ask", "defer"]).nullable().optional(),
				permissionDecisionReason: optionalString,
				updatedInput: optionalValue,
				additionalContext: optionalString,
			})
			.passthrough()
			.nullable()
			.optional(),
	})
	.passthrough();

export const permissionRequestOutputSchema = z
	.object({
		...universalShape,
		hookSpecificOutput: z
			.object({
				hookEventName: z.literal("PermissionRequest"),
				decision: z
					.object({
						behavior: z.enum(["allow", "deny"]),
						updatedInput: optionalValue,
						updatedPermissions: optionalValue,
						message: optionalString,
						interrupt: z.boolean().optional(),
					})
					.passthrough()
					.nullable()
					.optional(),
			})
			.passthrough()
			.nullable()
			.optional(),
	})
	.passthrough();

export const postToolUseOutputSchema = z
	.object({
		...universalShape,
		decision: z.literal("block").nullable().optional(),
		reason: optionalString,
		hookSpecificOutput: z
			.object({
				hookEventName: z.literal("PostToolUse"),
				additionalContext: optionalString,
				updatedMCPToolOutput: optionalValue,
			})
			.passthrough()
			.nullable()
			.optional(),
	})
	.passthrough();

export const postToolUseFailureOutputSchema = z
	.object({
		...universalShape,
		hookSpecificOutput: additionalContextOutput("PostToolUseFailure").nullable().optional(),
	})
	.passthrough();

export const compactOutputSchema = z.object(universalShape).passthrough();

export const stopOutputSchema = z
	.object({
		...universalShape,
		decision: z.literal("block").nullable().optional(),
		reason: optionalString,
		hookSpecificOutput: additionalContextOutput("Stop")
			.or(additionalContextOutput("SubagentStop"))
			.nullable()
			.optional(),
	})
	.passthrough();
