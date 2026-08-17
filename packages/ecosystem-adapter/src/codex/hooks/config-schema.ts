import { z } from "zod";

export const codexHookConfigRootSchema = z
	.object({
		hooks: z.record(z.string(), z.unknown()).optional(),
	})
	.passthrough();

export const codexHookEventGroupsSchema = z.array(z.unknown());

export const codexHookMatcherGroupSchema = z
	.object({
		matcher: z.unknown().optional(),
		hooks: z.array(z.unknown()).optional(),
	})
	.passthrough();

export const codexHookHandlerSchema = z
	.object({
		type: z.string(),
	})
	.passthrough();

export const codexCommandHookHandlerSchema = z
	.object({
		type: z.literal("command"),
		command: z.string().refine((value) => value.trim().length > 0),
		commandWindows: z.string().optional(),
		command_windows: z.string().optional(),
		timeout: z.number().finite().nonnegative().optional(),
		timeoutSec: z.number().finite().nonnegative().optional(),
		async: z.boolean().optional(),
		statusMessage: z.string().optional(),
	})
	.passthrough();

export const codexMatcherSchema = z.string().nullable().optional();
