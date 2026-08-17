import type { AgentTool, AgentToolUpdateCallback } from "@astravia/agent-core";
import type { ToolDefinition } from "@astravia/coding-agent";
import {
	addSessionGrant,
	assertSandboxPathNotDenied,
	collectShellWritePermissionRequests,
	confirmSandboxPermission,
	findSessionGrant,
	isSensitiveSandboxRequest,
	runWithSandboxShellGrant,
	type SandboxPermissionRequest,
} from "./sandbox-permissions.js";
import { assertWorkspacePathAllowed, resolveWorkspacePathAccess } from "./workspace-guard.js";

export interface SandboxGuardContext {
	/** Resolves the current session id at execute-time. Required for session-scoped grant cache. */
	getSessionId?(): string | undefined;
}

// AgentTool parameter types are intentionally tool-specific and not covariant.
// Keep this bridge narrow so runtime-core can wrap built-in tools without
// duplicating per-tool adapters.
export function toToolDefinition(tool: AgentTool<any, any>): ToolDefinition {
	return {
		name: tool.name,
		label: tool.label,
		description: tool.description,
		parameters: tool.parameters,
		execute: async (
			toolCallId: string,
			params: unknown,
			signal: AbortSignal | undefined,
			onUpdate: AgentToolUpdateCallback<unknown> | undefined,
		) => {
			return tool.execute(toolCallId, params as never, signal, onUpdate as never);
		},
	};
}

function extractPathFromParams(params: unknown): string | undefined {
	if (!params || typeof params !== "object") return undefined;
	if (!("path" in params)) return undefined;
	const pathValue = (params as { path?: unknown }).path;
	return typeof pathValue === "string" ? pathValue : undefined;
}

function extractCommandFromParams(params: unknown): string | undefined {
	if (!params || typeof params !== "object") return undefined;
	if (!("command" in params)) return undefined;
	const commandValue = (params as { command?: unknown }).command;
	return typeof commandValue === "string" ? commandValue : undefined;
}

export function wrapWorkspaceGuard(
	tool: AgentTool<any, any>,
	cwd: string,
	guardCtx?: SandboxGuardContext,
): ToolDefinition {
	const definition = toToolDefinition(tool);
	return {
		...definition,
		execute: async (toolCallId, params, signal, onUpdate, ctx) => {
			const requestedPath = extractPathFromParams(params);
			if (requestedPath) {
				const access = await resolveWorkspacePathAccess(requestedPath, cwd);
				assertSandboxPathNotDenied(access.targetBoundary, definition.name);
				assertSandboxPathNotDenied(access.targetPath, definition.name);
				if (!access.allowed) {
					const capability: SandboxPermissionRequest["capability"] =
						definition.name === "read" ? "file.read" : "file.write";
					const request: SandboxPermissionRequest = {
						capability,
						toolName: definition.name,
						target: requestedPath,
						resolvedTarget: access.targetBoundary,
						grantRoot: access.targetBoundary,
						reason: `${definition.name} target is outside the workspace sandbox`,
					};
					const sessionId = guardCtx?.getSessionId?.();
					const cached = sessionId ? findSessionGrant(sessionId, request) : undefined;
					if (!cached) {
						const decision = await confirmSandboxPermission(ctx, request);
						if (decision === "deny") {
							await assertWorkspacePathAllowed(requestedPath, cwd, definition.name);
						} else if (decision === "allow_session" && sessionId && !isSensitiveSandboxRequest(request)) {
							addSessionGrant(sessionId, request);
						}
					}
				}
			}
			return definition.execute(toolCallId, params, signal, onUpdate, ctx);
		},
	};
}

export function wrapShellPermissionGuard(
	tool: AgentTool<any, any>,
	cwd: string,
	guardCtx?: SandboxGuardContext,
): ToolDefinition {
	const definition = toToolDefinition(tool);
	return {
		...definition,
		execute: async (toolCallId, params, signal, onUpdate, ctx) => {
			const command = extractCommandFromParams(params);
			const requests = command ? collectShellWritePermissionRequests(command, cwd) : [];
			const sessionId = guardCtx?.getSessionId?.();
			const allowWriteRoots: string[] = [];
			for (const request of requests) {
				const cached = sessionId ? findSessionGrant(sessionId, request) : undefined;
				if (cached) {
					if (request.grantRoot) allowWriteRoots.push(request.grantRoot);
					continue;
				}
				const decision = await confirmSandboxPermission(ctx, request);
				if (decision === "deny") {
					throw new Error(
						`Access denied by sandbox: shell command requires write permission outside workspace.` +
							`\ntarget=${request.target}` +
							`\nresolved=${request.resolvedTarget}` +
							(request.grantRoot ? `\ngrantRoot=${request.grantRoot}` : ""),
					);
				}
				if (decision === "allow_session" && sessionId && !isSensitiveSandboxRequest(request)) {
					addSessionGrant(sessionId, request);
				}
				if (request.grantRoot) allowWriteRoots.push(request.grantRoot);
			}

			if (allowWriteRoots.length === 0) return definition.execute(toolCallId, params, signal, onUpdate, ctx);
			const uniqueAllowWriteRoots = Array.from(new Set(allowWriteRoots));
			return runWithSandboxShellGrant(
				cwd,
				{
					allowReadRoots: uniqueAllowWriteRoots,
					allowWriteRoots: uniqueAllowWriteRoots,
				},
				() => definition.execute(toolCallId, params, signal, onUpdate, ctx),
			);
		},
	};
}
