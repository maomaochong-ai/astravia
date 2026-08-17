export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type ActionRpcMethod = "actions.search" | "actions.describe" | "actions.run";
export type DebugRpcMethod = "debug.search" | "debug.describe" | "debug.run";
export type LocalRpcMethod = ActionRpcMethod | DebugRpcMethod;

export type ActionRpcRequest =
	| {
			id: string;
			method: "actions.search";
			params?: {
				query?: string;
				domain?: string;
			};
	  }
	| {
			id: string;
			method: "actions.describe";
			params: {
				actionId: string;
			};
	  }
	| {
			id: string;
			method: "actions.run";
			params: {
				actionId: string;
				input?: unknown;
			};
	  };

export type DebugRpcRequest =
	| {
			id: string;
			method: "debug.search";
			params?: {
				query?: string;
				category?: string;
			};
	  }
	| {
			id: string;
			method: "debug.describe";
			params: {
				debugId: string;
			};
	  }
	| {
			id: string;
			method: "debug.run";
			params: {
				debugId: string;
				input?: unknown;
			};
	  };

export type LocalRpcRequest = ActionRpcRequest | DebugRpcRequest;

export interface ActionRpcErrorBody {
	code: string;
	message: string;
	details?: JsonValue;
}

export type ActionRpcResponse =
	| {
			id: string;
			ok: true;
			result: JsonValue;
	  }
	| {
			id: string;
			ok: false;
			error: ActionRpcErrorBody;
	  };

export interface ActionRpcEndpoint {
	transport: "http";
	url: string;
	token: string;
}

export interface ActionRpcInvocationContext {
	requestId: string;
	signal?: AbortSignal;
}

export interface ActionRpcRuntime {
	search: (options: { query?: string; domain?: string }) => JsonValue | Promise<JsonValue>;
	describe: (actionId: string) => JsonValue | Promise<JsonValue>;
	run: (actionId: string, input: unknown, context: ActionRpcInvocationContext) => JsonValue | Promise<JsonValue>;
}

export interface DebugRpcRuntime {
	search: (options: { query?: string; category?: string }) => JsonValue | Promise<JsonValue>;
	describe: (debugId: string) => JsonValue | Promise<JsonValue>;
	run: (debugId: string, input: unknown, context: ActionRpcInvocationContext) => JsonValue | Promise<JsonValue>;
}

export interface LocalRpcRuntime {
	actions: ActionRpcRuntime;
	debug?: DebugRpcRuntime;
}
