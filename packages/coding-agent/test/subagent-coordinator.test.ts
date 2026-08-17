import type { EcosystemHookRuntime, HookDispatchOutcome } from "@astravia/ecosystem-adapter/hooks";
import { describe, expect, it, vi } from "vitest";
import { SubagentCoordinator } from "../src/core/subagents/coordinator.js";
import { createDefaultSubagentTypeRegistry } from "../src/core/subagents/index.js";
import type {
	SubagentChildHandle,
	SubagentCoordinatorOptions,
	SubagentSessionFactory,
	SubagentSnapshot,
} from "../src/core/subagents/types.js";
import { emptyUsage } from "../src/core/subagents/types.js";

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
		getLastAssistantText: () => "exploration done",
		dispose: () => {},
		subscribe: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		...overrides,
	};
}

function createFactory(handles?: SubagentChildHandle[]): SubagentSessionFactory {
	let i = 0;
	return {
		create: async () => {
			const h = handles?.[i++] ?? fakeHandle();
			return h;
		},
	};
}

function makeCoordinator(
	factory: SubagentSessionFactory,
	maxConcurrent = 3,
	extra?: { hookRuntime?: SubagentCoordinatorOptions["hookRuntime"] },
) {
	const updates: SubagentSnapshot[][] = [];
	const notifications: string[] = [];
	const coord = new SubagentCoordinator({
		factory,
		typeRegistry: createDefaultSubagentTypeRegistry(),
		parentSessionId: "parent-1",
		cwd: "/tmp/project",
		scenario: "project",
		getModel: () =>
			({
				id: "test",
				provider: "test",
				name: "test",
			}) as never,
		getThinkingLevel: () => "off",
		getParentMcpTools: () => [],
		maxConcurrent,
		hookRuntime: extra?.hookRuntime,
		onUpdate: (agents) => updates.push([...agents]),
		onNotify: (p) => notifications.push(p.text),
	});
	return { coord, updates, notifications };
}

function emptyHookOutcome(overrides?: Partial<HookDispatchOutcome>): HookDispatchOutcome {
	return {
		shouldStop: false,
		shouldBlock: false,
		additionalContexts: [],
		continuationFragments: [],
		runs: [],
		...overrides,
	};
}

describe("SubagentCoordinator", () => {
	it("fires SubagentStart then SubagentStop around a successful run", async () => {
		const calls: string[] = [];
		const hookRuntime = {
			runSubagentStart: async () => {
				calls.push("start");
				return emptyHookOutcome({ additionalContexts: ["policy: read-only"] });
			},
			runSubagentStop: async () => {
				calls.push("stop");
				return emptyHookOutcome();
			},
			recordAdditionalContexts: async () => {},
		} as unknown as EcosystemHookRuntime;

		const prompted: string[] = [];
		const listeners = new Set<(e: { type: string }) => void>();
		const full = fakeHandle({
			prompt: async (text) => {
				prompted.push(text);
				for (const l of listeners) l({ type: "agent_start" });
				for (const l of listeners) l({ type: "agent_end" });
			},
			subscribe: (listener) => {
				listeners.add(listener);
				return () => listeners.delete(listener);
			},
		});

		const { coord } = makeCoordinator(createFactory([full]), 3, { hookRuntime });
		await coord.spawn({
			taskName: "api_trace",
			message: "map auth flow",
			agentType: "explorer",
		});

		await vi.waitFor(() => {
			expect(coord.list()[0]?.status).toBe("completed");
		});
		expect(calls).toEqual(["start", "stop"]);
		expect(prompted[0]).toContain("policy: read-only");
		expect(prompted[0]).toContain("map auth flow");
	});

	it("aborts spawn when SubagentStart blocks", async () => {
		const disposed: string[] = [];
		const hookRuntime = {
			runSubagentStart: async () =>
				emptyHookOutcome({ shouldBlock: true, blockReason: "subagents disabled by policy" }),
			runSubagentStop: async () => emptyHookOutcome(),
			recordAdditionalContexts: async () => {},
		} as unknown as EcosystemHookRuntime;

		const handle = fakeHandle({
			dispose: () => {
				disposed.push("yes");
			},
		});
		const { coord } = makeCoordinator(createFactory([handle]), 3, { hookRuntime });
		await expect(
			coord.spawn({
				taskName: "blocked",
				message: "should not run",
				agentType: "explorer",
			}),
		).rejects.toThrow(/subagents disabled by policy/);
		expect(disposed).toEqual(["yes"]);
		expect(coord.list()[0]?.status).toBe("failed");
	});

	it("spawns explorer and completes with final text", async () => {
		const { coord } = makeCoordinator(createFactory());
		const snap = await coord.spawn({
			taskName: "api_trace",
			message: "map auth flow",
			agentType: "explorer",
		});
		expect(snap.taskName).toBe("api_trace");
		expect(snap.path).toBe("/root/api_trace");
		expect(snap.agentType).toBe("explorer");

		// prompt is fire-and-forget; give microtasks a tick
		await vi.waitFor(() => {
			const listed = coord.list();
			expect(listed[0]?.status).toBe("completed");
			expect(listed[0]?.finalText).toBe("exploration done");
		});
	});

	it("rejects unknown agent types (registry fail-closed)", async () => {
		const { coord } = makeCoordinator(createFactory());
		await expect(
			coord.spawn({
				taskName: "x",
				message: "hi",
				agentType: "worker",
			}),
		).rejects.toThrow(/Unknown agent_type/);
	});

	it("rejects duplicate task_name", async () => {
		const slow = fakeHandle({
			prompt: async () => {
				await new Promise((r) => setTimeout(r, 50));
			},
		});
		const { coord } = makeCoordinator(createFactory([slow]));
		await coord.spawn({ taskName: "scan", message: "a", agentType: "explorer" });
		await expect(coord.spawn({ taskName: "scan", message: "b", agentType: "explorer" })).rejects.toThrow(
			/already used/,
		);
		await coord.dispose();
	});

	it("enforces maxConcurrent", async () => {
		const mkSlow = () =>
			fakeHandle({
				prompt: async () => {
					await new Promise((r) => setTimeout(r, 200));
				},
			});
		const { coord } = makeCoordinator(createFactory([mkSlow(), mkSlow(), mkSlow()]), 2);
		await coord.spawn({ taskName: "a", message: "1", agentType: "explorer" });
		await coord.spawn({ taskName: "b", message: "2", agentType: "explorer" });
		await expect(coord.spawn({ taskName: "c", message: "3", agentType: "explorer" })).rejects.toThrow(
			/Too many active/,
		);
		await coord.dispose();
	});

	it("wait claims delivery and returns summary", async () => {
		const { coord, notifications } = makeCoordinator(createFactory());
		await coord.spawn({ taskName: "w1", message: "task", agentType: "explorer" });
		const result = await coord.wait({ timeoutMs: 2000 });
		expect(result.timedOut).toBe(false);
		expect(result.agents.length).toBe(1);
		expect(result.agents[0]?.finalText).toBe("exploration done");
		// notification should not re-fire for claimed generation
		await new Promise((r) => setTimeout(r, 80));
		expect(notifications.length).toBe(0);
	});

	it("interrupt marks interrupted", async () => {
		const h = fakeHandle({
			prompt: async () => {
				await new Promise((r) => setTimeout(r, 500));
			},
		});
		const { coord } = makeCoordinator(createFactory([h]));
		const snap = await coord.spawn({ taskName: "long", message: "x", agentType: "explorer" });
		const after = coord.interrupt(snap.id);
		expect(after.status).toBe("interrupted");
		await coord.dispose();
	});

	it("list resolves by task_name and path", async () => {
		const { coord } = makeCoordinator(createFactory());
		const snap = await coord.spawn({ taskName: "docs", message: "read", agentType: "explorer" });
		expect(coord.get("docs")?.id).toBe(snap.id);
		expect(coord.get("/root/docs")?.id).toBe(snap.id);
		await coord.dispose();
	});

	it("type registry allows horizontal extension without coordinator changes", async () => {
		const registry = createDefaultSubagentTypeRegistry();
		registry.register({
			id: "stub_reader",
			label: "Stub",
			description: "test-only type",
			createBuiltinTools: () => [],
			inheritParentMcp: false,
			systemPromptAddon: "stub",
		});
		const factory = createFactory();
		const coord = new SubagentCoordinator({
			factory,
			typeRegistry: registry,
			parentSessionId: "p",
			cwd: "/tmp",
			scenario: "cli",
			getModel: () => ({ id: "m", provider: "p" }) as never,
			getThinkingLevel: () => "off",
			getParentMcpTools: () => [],
		});
		const snap = await coord.spawn({
			taskName: "s1",
			message: "go",
			agentType: "stub_reader",
		});
		expect(snap.agentType).toBe("stub_reader");
		await coord.dispose();
	});

	it("emptyUsage helper is stable", () => {
		expect(emptyUsage()).toEqual({
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			costTotal: 0,
		});
	});

	it("clearFinished removes terminal children and frees task_name", async () => {
		const { coord } = makeCoordinator(createFactory());
		await coord.spawn({ taskName: "done_one", message: "task", agentType: "explorer" });
		await vi.waitFor(() => {
			expect(coord.list()[0]?.status).toBe("completed");
		});
		expect(coord.clearFinished()).toBe(1);
		expect(coord.list()).toHaveLength(0);
		// name is reusable
		const again = await coord.spawn({ taskName: "done_one", message: "again", agentType: "explorer" });
		expect(again.taskName).toBe("done_one");
		await coord.dispose();
	});

	it("clearFinished does not remove running children", async () => {
		const slow = fakeHandle({
			prompt: async () => {
				await new Promise((r) => setTimeout(r, 500));
			},
		});
		const { coord } = makeCoordinator(createFactory([slow]));
		await coord.spawn({ taskName: "long_run", message: "x", agentType: "explorer" });
		expect(coord.clearFinished()).toBe(0);
		expect(coord.list()).toHaveLength(1);
		await coord.dispose();
	});
});
