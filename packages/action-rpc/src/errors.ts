import type { JsonValue } from "./types.js";

export class ActionRpcError extends Error {
	code: string;
	details?: JsonValue;

	constructor(code: string, message: string, details?: JsonValue) {
		super(message);
		this.name = "ActionRpcError";
		this.code = code;
		this.details = details;
	}
}
