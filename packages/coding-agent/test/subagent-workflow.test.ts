import { describe, expect, it, vi } from "vitest";
import { SubagentCoordinator } from "../src/core/subagents/coordinator.js";
import { buildForkSeedMessages, trimDanglingToolCalls } from "../src/core/subagents/fork-context.js";
import { createDefaultSubagentTypeRegistry } from "../src/core/subagents/index.js";
import { createWaitAgentTool } from "../src/core/subagents/tools/wait-agent.js";
import type {
	SubagentChildHandle,
	SubagentParentContext,
	SubagentSessionFactory,
	SubagentSnapshot,
	SubagentSpawnRequest,
	SubagentTodoProgress,
} from "../src/core/subagents/types.js";

function fakeHandle(overrides?: Partial<SubagentChildHandle> & { id?: string }): SubagentChildHandle {
	const id = overrides?.id ?? `child-${Math.random().toString(36).slice(2, 8)}`;
	let streaming = false;
	const listeners = new Set<(e: { type: string }) => void>();
	return {
		sessionId: id,
		sessionFile: undefined,
		prompt: async () => {
			streaming = true;
			for (const l of listeners) l({ type: "agent_start" });
			streaming = false;
			for (const l of listeners) l({ type: "agent_end" });
		},
		sendMessage: async () => {},
		followUp: async () => {},
		abort: () => {
			streaming = false;
		},
		waitForIdle: async () => {},
		isStreaming: () => streaming,
		getLastAssistantText: () => "workflow done",
		dispose: () => {},
		subscribe: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		...overrides,
	};
}

function slowHandle(ms = 500): SubagentChildHandle {
	const listeners = new Set<(e: { type: string }) => void>();
	let done = false;
	return fakeHandle({
		prompt: async () => {
			for (const l of listeners) l({ type: "agent_start" });
			await new Promise((r) => setTimeout(r, ms));
			done = true;
			for (const l of listeners) l({ type: "agent_end" });
		},
		isStreaming: () => !done,
		subscribe: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	});
}

function makeCoordinator(
	factory: SubagentSessionFactory,
	options?: { maxConcurrent?: number; getParentContextMessages?: () => never[] },
) {
	const updates: SubagentSnapshot[][] = [];
	const notifications: string[] = [];
	const coord = new SubagentCoordinator({
		factory,
		typeRegistry: createDefaultSubagentTypeRegistry(),
		parentSessionId: "parent-1",
		cwd: "/tmp/project",
		scenario: "project",
		getModel: () => ({ id: "test", provider: "test", name: "test" }) as never,
		getThinkingLevel: () => "off",
		getParentMcpTools: () => [],
		getParentContextMessages: options?.getParentContextMessages,
		maxConcurrent: options?.maxConcurrent ?? 2,
		onUpdate: (agents) => updates.push([...agents]),
		onNotify: (p) => notifications.push(p.text),
	});
	return { coord, updates, notifications };
}

function wf(name: string, todos: string[] = ["t1"]): SubagentSpawnRequest {
	return { taskName: name, message: `do ${name}`, agentType: "workflow", todos };
}

describe("SubagentCoordinator.spawnMany (workflow dispatch)", () => {
	it("accepts a batch, queues beyond maxConcurrent, and auto-refills", async () => {
		const created: SubagentSpawnRequest[] = [];
		const factory: SubagentSessionFactory = {
			create: async (request) => {
				created.push(request);
				return fakeHandle();
			},
		};
		const { coord } = makeCoordinator(factory, { maxConcurrent: 2 });
		const snaps = coord.spawnMany([wf("a"), wf("b"), wf("c"), wf("d")]);
		expect(snaps).toHaveLength(4);
		expect(snaps.filter((s) => s.status === "queued")).toHaveLength(2);

		// fake handles complete instantly → queue drains until all completed
		await vi.waitFor(() => {
			const listed = coord.list();
			expect(listed.filter((s) => s.status === "completed")).toHaveLength(4);
		});
		expect(created.map((r) => r.taskName).sort()).toEqual(["a", "b", "c", "d"]);
		await coord.dispose();
	});

	it("passes todos through to the factory request", async () => {
		let received: string[] | undefined;
		const factory: SubagentSessionFactory = {
			create: async (request) => {
				received = request.todos;
				return fakeHandle();
			},
		};
		const { coord } = makeCoordinator(factory);
		coord.spawnMany([wf("with_todos", ["step one", "step two"])]);
		await vi.waitFor(() => expect(received).toEqual(["step one", "step two"]));
		await coord.dispose();
	});

	it("rejects the whole batch on duplicate task_name (nothing reserved)", () => {
		const { coord } = makeCoordinator({ create: async () => fakeHandle() });
		expect(() => coord.spawnMany([wf("dup"), wf("dup")])).toThrow(/Duplicate task_name/);
		expect(coord.list()).toHaveLength(0);
	});

	it("interrupting a queued workflow removes it from the queue", async () => {
		const factory: SubagentSessionFactory = { create: async () => slowHandle(300) };
		const { coord } = makeCoordinator(factory, { maxConcurrent: 1 });
		const snaps = coord.spawnMany([wf("first"), wf("second")]);
		const queued = snaps.find((s) => s.status === "queued");
		expect(queued).toBeDefined();
		const after = coord.interrupt(queued!.taskName);
		expect(after.status).toBe("interrupted");
		await vi.waitFor(() => {
			expect(coord.get("first")?.status).toBe("completed");
		});
		// interrupted queued child must never start
		expect(coord.get("second")?.status).toBe("interrupted");
		await coord.dispose();
	});

	it("mirrors todo progress into snapshots via subscribeTodos", async () => {
		let pushProgress: ((p: SubagentTodoProgress) => void) | undefined;
		const handle = fakeHandle({
			prompt: async () => {},
			getTodoProgress: () => ({ done: 0, total: 3 }),
			subscribeTodos: (listener) => {
				pushProgress = listener;
				return () => {};
			},
		});
		const factory: SubagentSessionFactory = { create: async () => handle };
		const { coord } = makeCoordinator(factory);
		coord.spawnMany([wf("progress", ["a", "b", "c"])]);
		await vi.waitFor(() => {
			expect(coord.get("progress")?.todoProgress).toEqual({ done: 0, total: 3 });
		});
		pushProgress?.({ done: 2, total: 3 });
		expect(coord.get("progress")?.todoProgress).toEqual({ done: 2, total: 3 });
		await coord.dispose();
	});

	it("carries the human-readable title into snapshots", async () => {
		const { coord } = makeCoordinator({ create: async () => fakeHandle() });
		const snaps = coord.spawnMany([{ ...wf("titled"), title: "重构鉴权层" }]);
		expect(snaps[0]?.title).toBe("重构鉴权层");
		await vi.waitFor(() => expect(coord.get("titled")?.title).toBe("重构鉴权层"));
		await coord.dispose();
	});

	it("a new dispatch batch clears terminal workflows of the same type and frees names", async () => {
		const { coord } = makeCoordinator({ create: async () => fakeHandle() });
		coord.spawnMany([wf("alpha"), wf("beta")]);
		await vi.waitFor(() => {
			expect(coord.list().every((s) => s.status === "completed")).toBe(true);
		});
		const next = coord.spawnMany([wf("alpha")]);
		expect(next).toHaveLength(1);
		// old terminal entries are gone; only the fresh batch remains
		const names = coord.list().map((s) => s.taskName);
		expect(names).toEqual(["alpha"]);
		await coord.dispose();
	});

	it("keeps interrupted workflows across a new dispatch batch (resume candidates)", async () => {
		let pushProgress: ((p: SubagentTodoProgress) => void) | undefined;
		const paused = fakeHandle({
			prompt: async () => {
				await new Promise((r) => setTimeout(r, 500));
			},
			getTodoProgress: () => ({ done: 2, total: 5 }),
			subscribeTodos: (listener) => {
				pushProgress = listener;
				return () => {};
			},
		});
		const factory: SubagentSessionFactory = {
			create: async (request) => (request.taskName === "paused" ? paused : fakeHandle()),
		};
		const { coord } = makeCoordinator(factory, { maxConcurrent: 3 });
		coord.spawnMany([wf("paused", ["a", "b", "c", "d", "e"])]);
		await vi.waitFor(() => expect(coord.get("paused")?.status).toBe("running"));
		coord.interrupt("paused");
		expect(coord.get("paused")?.status).toBe("interrupted");
		expect(coord.get("paused")?.todoProgress).toEqual({ done: 2, total: 5 });

		// New batch must NOT wipe the interrupted (resumable) workflow.
		coord.spawnMany([wf("other")]);
		expect(coord.get("paused")?.status).toBe("interrupted");

		// Resume via followUp: same child, progress intact, runs again.
		const resumed = await coord.followUp("paused", "continue the remaining todos");
		expect(resumed.status).toBe("running");
		expect(coord.get("paused")?.todoProgress).toEqual({ done: 2, total: 5 });
		pushProgress?.({ done: 3, total: 5 });
		expect(coord.get("paused")?.todoProgress).toEqual({ done: 3, total: 5 });
		await coord.dispose();
	});

	it("wait_agent refuses to park on workflow-only children (notification-driven instead)", async () => {
		const factory: SubagentSessionFactory = { create: async () => slowHandle(5000) };
		const { coord } = makeCoordinator(factory, { maxConcurrent: 2 });
		coord.spawnMany([wf("long_a"), wf("long_b")]);
		await vi.waitFor(() => expect(coord.get("long_a")?.status).toBe("running"));

		const tool = createWaitAgentTool({ getCoordinator: () => coord });
		const started = Date.now();
		const result = await tool.execute("t1", { description: "wait", timeout_ms: 60_000 } as never);
		// Guard caps the wait at 1s regardless of the requested timeout.
		expect(Date.now() - started).toBeLessThan(3000);
		const text = (result.content[0] as { text: string }).text;
		expect(text).toContain("subagent_notification");
		expect((result.details as { workflowNoWait?: boolean }).workflowNoWait).toBe(true);
		await coord.dispose();
	});

	it("forwards the parent context snapshot for workflow types only", async () => {
		const seen: Array<SubagentParentContext["forkContextMessages"]> = [];
		const factory: SubagentSessionFactory = {
			create: async (_request, parent) => {
				seen.push(parent.forkContextMessages);
				return fakeHandle();
			},
		};
		const parentMessages = [{ role: "user", content: "hello", timestamp: 1 }] as never[];
		const { coord } = makeCoordinator(factory, {
			maxConcurrent: 3,
			getParentContextMessages: () => parentMessages,
		});
		coord.spawnMany([wf("forked")]);
		await coord.spawn({ taskName: "explore", message: "look", agentType: "explorer" });
		await vi.waitFor(() => expect(seen).toHaveLength(2));
		expect(seen[0]).toBe(parentMessages);
		expect(seen[1]).toBeUndefined();
		await coord.dispose();
	});
});

describe("fork-context sanitising", () => {
	const user = (text: string) => ({ role: "user" as const, content: text, timestamp: 1 });
	const assistantWithCall = (id: string) => ({
		role: "assistant" as const,
		content: [{ type: "toolCall" as const, id, name: "bash", arguments: {} }],
		api: "x" as never,
		provider: "p" as never,
		model: "m",
		usage: {} as never,
		stopReason: "toolUse" as const,
		timestamp: 2,
	});
	const toolResult = (id: string) => ({
		role: "toolResult" as const,
		toolCallId: id,
		toolName: "bash",
		content: [{ type: "text" as const, text: "ok" }],
		isError: false,
		timestamp: 3,
	});

	it("cuts a trailing assistant message with unresolved tool calls", () => {
		const messages = [user("q"), assistantWithCall("c1")] as never[];
		expect(trimDanglingToolCalls(messages)).toHaveLength(1);
	});

	it("cuts partial results of a half-finished multi-call turn", () => {
		const a = {
			...assistantWithCall("c1"),
			content: [
				{ type: "toolCall" as const, id: "c1", name: "bash", arguments: {} },
				{ type: "toolCall" as const, id: "c2", name: "bash", arguments: {} },
			],
		};
		const messages = [user("q"), a, toolResult("c1")] as never[];
		expect(trimDanglingToolCalls(messages)).toHaveLength(1);
	});

	it("keeps a fully resolved tool exchange", () => {
		const messages = [user("q"), assistantWithCall("c1"), toolResult("c1")] as never[];
		expect(trimDanglingToolCalls(messages)).toHaveLength(3);
	});

	it("converts compaction summaries into custom seed messages", () => {
		const messages = [
			{ role: "compactionSummary" as const, summary: "earlier work", tokensBefore: 100, timestamp: 1 },
			user("recent"),
		] as never[];
		const seeds = buildForkSeedMessages(messages);
		expect(seeds).toHaveLength(2);
		expect(seeds[0]).toMatchObject({ role: "custom", customType: "workflow-fork-summary" });
		expect((seeds[0] as { content: string }).content).toContain("earlier work");
	});
});
