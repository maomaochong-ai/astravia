import type { SessionError } from "./contracts.js";

export const RUNTIME_ERROR_CODES = {
	SESSION_NOT_FOUND: "SESSION_NOT_FOUND",
	INVALID_REQUEST: "INVALID_REQUEST",
	EXECUTION_MODE_SWITCH_BLOCKED: "EXECUTION_MODE_SWITCH_BLOCKED",
	INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export function runtimeError(
	code: keyof typeof RUNTIME_ERROR_CODES,
	message: string,
	retryable: boolean,
	origin: SessionError["origin"] = "runtime",
	details?: unknown,
): SessionError {
	return {
		code: RUNTIME_ERROR_CODES[code],
		message,
		retryable,
		origin,
		details,
	};
}
