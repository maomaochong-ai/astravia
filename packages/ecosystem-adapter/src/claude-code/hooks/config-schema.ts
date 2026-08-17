import { z } from "zod";

export const claudeHookConfigRootSchema = z
	.object({
		description: z.string().optional(),
		hooks: z.record(z.string(), z.unknown()).optional(),
	})
	.passthrough();

export const claudeHookEventGroupsSchema = z.array(z.unknown());

export const claudeHookMatcherGroupSchema = z
	.object({
		matcher: z.unknown().optional(),
		hooks: z.array(z.unknown()).optional(),
	})
	.passthrough();

export const claudeHookHandlerSchema = z
	.object({
		type: z.string(),
	})
	.passthrough();

export const claudeCommandHookHandlerSchema = z
	.object({
		type: z.literal("command"),
		command: z.string().refine((value) => value.trim().length > 0),
		args: z.array(z.string()).optional(),
		timeout: z.number().finite().nonnegative().optional(),
		async: z.boolean().optional(),
		asyncRewake: z.boolean().optional(),
		statusMessage: z.string().optional(),
		shell: z.enum(["bash", "powershell"]).optional(),
		if: z.string().optional(),
		once: z.boolean().optional(),
	})
	.passthrough();

export const claudeMatcherSchema = z.string().nullable().optional();
