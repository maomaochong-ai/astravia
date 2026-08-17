import { z } from "zod";

const optionalString = z.string().nullable().optional();
const optionalValue = z.unknown().nullable().optional();

const universalShape = {
	continue: z.boolean().optional(),
	stopReason: optionalString,
	suppressOutput: z.boolean().optional(),
	systemMessage: optionalString,
};

function additionalContextOutput(eventName: "SessionStart" | "SubagentStart" | "UserPromptSubmit") {
	return z.strictObject({
		hookEventName: z.literal(eventName),
		additionalContext: optionalString,
	});
}

export const sessionStartOutputSchema = z.strictObject({
	...universalShape,
	hookSpecificOutput: additionalContextOutput("SessionStart").nullable().optional(),
});

export const subagentStartOutputSchema = z.strictObject({
	...universalShape,
	hookSpecificOutput: additionalContextOutput("SubagentStart").nullable().optional(),
});

export const userPromptSubmitOutputSchema = z.strictObject({
	...universalShape,
	decision: z.literal("block").nullable().optional(),
	reason: optionalString,
	hookSpecificOutput: additionalContextOutput("UserPromptSubmit").nullable().optional(),
});

export const preToolUseOutputSchema = z.strictObject({
	...universalShape,
	decision: z.enum(["approve", "block"]).nullable().optional(),
	reason: optionalString,
	hookSpecificOutput: z
		.strictObject({
			hookEventName: z.literal("PreToolUse"),
			permissionDecision: z.enum(["allow", "deny", "ask"]).nullable().optional(),
			permissionDecisionReason: optionalString,
			updatedInput: optionalValue,
			additionalContext: optionalString,
		})
		.nullable()
		.optional(),
});

export const permissionRequestOutputSchema = z.strictObject({
	...universalShape,
	hookSpecificOutput: z
		.strictObject({
			hookEventName: z.literal("PermissionRequest"),
			decision: z
				.strictObject({
					behavior: z.enum(["allow", "deny"]),
					updatedInput: optionalValue,
					updatedPermissions: optionalValue,
					message: optionalString,
					interrupt: z.boolean().optional(),
				})
				.nullable()
				.optional(),
		})
		.nullable()
		.optional(),
});

export const postToolUseOutputSchema = z.strictObject({
	...universalShape,
	decision: z.literal("block").nullable().optional(),
	reason: optionalString,
	hookSpecificOutput: z
		.strictObject({
			hookEventName: z.literal("PostToolUse"),
			additionalContext: optionalString,
			updatedMCPToolOutput: optionalValue,
		})
		.nullable()
		.optional(),
});

export const compactOutputSchema = z.strictObject(universalShape);

export const stopOutputSchema = z.strictObject({
	...universalShape,
	decision: z.literal("block").nullable().optional(),
	reason: optionalString,
});
