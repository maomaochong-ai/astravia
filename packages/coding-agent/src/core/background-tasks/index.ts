/**
 * Background task manager for long-running bash commands.
 *
 * The bash tool spawns background tasks here when `run_in_background` is set.
 * Each task runs detached from the agent loop: output is streamed to a log
 * file on disk, and a completion notification is dispatched (via the
 * `onNotify` hook wired by AgentSession) so the agent can react when done.
 *
 * Lifecycle is bound to the owning session: AgentSession.dispose() kills all
 * still-running tasks.
 */

import { randomBytes } from "node:crypto";
import { createWriteStream, type WriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type ChildProcess, spawn } from "child_process";
import stripAnsi from "strip-ansi";
import {
	getDefaultShellCommandPrefix,
	getShellConfig,
	killProcessTree,
	prependCommandPrefixes,
	sanitizeBinaryOutput,
} from "../../utils/shell.js";

export type BackgroundTaskStatus = "running" | "completed" | "failed" | "killed";

/** Who requested termination of a running background task. */
export type BackgroundTaskEndedBy = "user" | "agent" | "dispose";

/** Serializable task state, safe to send over IPC to UI layers. */
export interface BackgroundTaskSnapshot {
	id: string;
	command: string;
	cwd: string;
	status: BackgroundTaskStatus;
	outputFile: string;
	exitCode: number | undefined;
	startedAt: number;
	endedAt?: number;
	toolCallId?: string;
	/** Rolling tail of sanitized output (last ~2KB) for live UI display. */
	tail: string;
	/** Present when status is "killed" and a kill reason was recorded. */
	endedBy?: BackgroundTaskEndedBy;
}

export type BackgroundTaskEvent =
	| { type: "task_started"; task: BackgroundTaskSnapshot }
	| { type: "task_output"; task: BackgroundTaskSnapshot }
	| { type: "task_ended"; task: BackgroundTaskSnapshot }
	| { type: "tasks_cleared" };

export type BackgroundTaskListener = (event: BackgroundTaskEvent) => void;

export interface SpawnBackgroundTaskOptions {
	command: string;
	cwd: string;
	env: NodeJS.ProcessEnv;
	toolCallId?: string;
	/**
	 * When true, `onNotify` only fires if the task was auto-promoted (wait soft-timeout).
	 * Used by foreground soft-wait: if the process exits before block_until, the result is
	 * returned inline and no <task-notification> is injected.
	 */
	notifyOnlyIfPromoted?: boolean;
}

interface InternalTask {
	snapshot: BackgroundTaskSnapshot;
	child: ChildProcess;
	stream: WriteStream;
	/** Read cursor for the task_output tool (bytes into the sanitized log). */
	readOffset: number;
	/** Bytes written to the log file so far. */
	writtenBytes: number;
	/** Guards against double end (close + error both firing). */
	ended: boolean;
	/** Guards against duplicate completion notifications. */
	notified: boolean;
	/** True after wait() soft-timeout: agent received task id; completion may notify. */
	promoted: boolean;
	/** When true, suppress onNotify unless promoted. */
	notifyOnlyIfPromoted: boolean;
	/** Waiters registered by wait(); resolved when the task ends. */
	waiters: Array<() => void>;
	outputTimer?: NodeJS.Timeout;
	/** Set when kill() is called so finish() can annotate the snapshot. */
	killReason?: BackgroundTaskEndedBy;
}

const TAIL_MAX_CHARS = 2048;
const OUTPUT_EVENT_THROTTLE_MS = 200;

export class BackgroundTaskManager {
	private tasks = new Map<string, InternalTask>();
	private listeners: BackgroundTaskListener[] = [];
	private counter = 0;

	/**
	 * Completion notification hook, wired by AgentSession to inject a
	 * <task-notification> message back into the agent loop. Fired at most once
	 * per task (notified flag).
	 */
	onNotify?: (task: BackgroundTaskSnapshot) => void;

	subscribe(listener: BackgroundTaskListener): () => void {
		this.listeners.push(listener);
		return () => {
			const index = this.listeners.indexOf(listener);
			if (index !== -1) this.listeners.splice(index, 1);
		};
	}

	private emit(event: BackgroundTaskEvent): void {
		for (const l of this.listeners) l(event);
	}

	/** Spawn a detached background command. Returns the initial snapshot. */
	spawn(options: SpawnBackgroundTaskOptions): BackgroundTaskSnapshot {
		const id = `b${++this.counter}`;
		const outputFile = join(tmpdir(), `astravia-task-${id}-${randomBytes(4).toString("hex")}.log`);
		const stream = createWriteStream(outputFile);

		const { shell, args } = getShellConfig();
		const resolvedCommand = prependCommandPrefixes(options.command, [getDefaultShellCommandPrefix(shell)]);
		const child = spawn(shell, [...args, resolvedCommand], {
			cwd: options.cwd,
			detached: process.platform !== "win32",
			env: options.env,
			stdio: ["ignore", "pipe", "pipe"],
		});

		const task: InternalTask = {
			snapshot: {
				id,
				command: options.command,
				cwd: options.cwd,
				status: "running",
				outputFile,
				exitCode: undefined,
				startedAt: Date.now(),
				toolCallId: options.toolCallId,
				tail: "",
			},
			child,
			stream,
			readOffset: 0,
			writtenBytes: 0,
			ended: false,
			notified: false,
			promoted: false,
			notifyOnlyIfPromoted: options.notifyOnlyIfPromoted ?? false,
			waiters: [],
		};
		this.tasks.set(id, task);

		const decoder = new TextDecoder();
		const handleData = (data: Buffer) => {
			// Sanitize at the source, same as the foreground bash executor.
			const text = sanitizeBinaryOutput(stripAnsi(decoder.decode(data, { stream: true }))).replace(/\r/g, "");
			if (!text) return;
			task.stream.write(text);
			task.writtenBytes += Buffer.byteLength(text, "utf-8");
			task.snapshot.tail = (task.snapshot.tail + text).slice(-TAIL_MAX_CHARS);
			this.scheduleOutputEvent(task);
		};
		child.stdout?.on("data", handleData);
		child.stderr?.on("data", handleData);

		child.on("close", (code) => {
			this.finish(task, code === null ? "killed" : code === 0 ? "completed" : "failed", code ?? undefined);
		});
		child.on("error", (err) => {
			const text = `\nFailed to spawn command: ${err.message}\n`;
			task.stream.write(text);
			task.writtenBytes += Buffer.byteLength(text, "utf-8");
			task.snapshot.tail = (task.snapshot.tail + text).slice(-TAIL_MAX_CHARS);
			this.finish(task, "failed", undefined);
		});

		this.emit({ type: "task_started", task: { ...task.snapshot } });
		return { ...task.snapshot };
	}

	private scheduleOutputEvent(task: InternalTask): void {
		if (task.outputTimer || task.ended) return;
		task.outputTimer = setTimeout(() => {
			task.outputTimer = undefined;
			if (!task.ended) this.emit({ type: "task_output", task: { ...task.snapshot } });
		}, OUTPUT_EVENT_THROTTLE_MS);
	}

	private finish(task: InternalTask, status: BackgroundTaskStatus, exitCode: number | undefined): void {
		if (task.ended) return;
		task.ended = true;
		if (task.outputTimer) {
			clearTimeout(task.outputTimer);
			task.outputTimer = undefined;
		}
		task.stream.end();
		// Intentional kill (UI / task_stop / dispose) always reports "killed",
		// even when the OS reports a non-null exit code (common on Windows).
		const resolvedStatus: BackgroundTaskStatus = task.killReason ? "killed" : status;
		task.snapshot.status = resolvedStatus;
		task.snapshot.exitCode = exitCode;
		task.snapshot.endedAt = Date.now();
		if (task.killReason) {
			task.snapshot.endedBy = task.killReason;
		}

		const waiters = task.waiters.splice(0, task.waiters.length);
		for (const w of waiters) {
			try {
				w();
			} catch {
				// ignore waiter errors
			}
		}

		this.emit({ type: "task_ended", task: { ...task.snapshot } });

		// Suppress notify when foreground soft-wait already returned the full result inline.
		const shouldNotify = !task.notifyOnlyIfPromoted || task.promoted;
		if (shouldNotify && !task.notified && this.onNotify) {
			task.notified = true;
			this.onNotify({ ...task.snapshot });
		}
	}

	/**
	 * Wait until a task ends, or until maxMs elapses.
	 * On soft timeout the task is marked promoted (still running) so a later finish may notify.
	 * On natural completion before maxMs, notify is suppressed when notifyOnlyIfPromoted was set.
	 */
	async wait(
		taskId: string,
		options: { maxMs: number; signal?: AbortSignal },
	): Promise<{ stillRunning: boolean; snapshot: BackgroundTaskSnapshot }> {
		const task = this.tasks.get(taskId);
		if (!task) {
			throw new Error(`Background task "${taskId}" not found.`);
		}
		if (task.ended) {
			return { stillRunning: false, snapshot: { ...task.snapshot } };
		}

		const { maxMs, signal } = options;
		if (signal?.aborted) {
			this.kill(taskId);
			throw new Error("aborted");
		}

		return new Promise((resolve, reject) => {
			let settled = false;

			const cleanup = () => {
				signal?.removeEventListener("abort", onAbort);
				clearTimeout(timer);
				const idx = task.waiters.indexOf(onEnd);
				if (idx >= 0) task.waiters.splice(idx, 1);
			};

			const settle = (stillRunning: boolean) => {
				if (settled) return;
				settled = true;
				cleanup();
				if (stillRunning) {
					task.promoted = true;
				}
				resolve({ stillRunning, snapshot: { ...task.snapshot } });
			};

			const onEnd = () => settle(false);

			const onAbort = () => {
				if (settled) return;
				settled = true;
				cleanup();
				this.kill(taskId);
				reject(new Error("aborted"));
			};

			const timer = setTimeout(() => settle(true), Math.max(0, maxMs));
			task.waiters.push(onEnd);
			signal?.addEventListener("abort", onAbort, { once: true });

			// Race: may have ended between the ended check and registering the waiter
			if (task.ended) {
				settle(false);
			}
		});
	}

	get(taskId: string): BackgroundTaskSnapshot | undefined {
		const task = this.tasks.get(taskId);
		return task ? { ...task.snapshot } : undefined;
	}

	list(): BackgroundTaskSnapshot[] {
		return Array.from(this.tasks.values()).map((t) => ({ ...t.snapshot }));
	}

	/** Whether any task is still running. */
	get runningCount(): number {
		let count = 0;
		for (const t of this.tasks.values()) {
			if (t.snapshot.status === "running") count++;
		}
		return count;
	}

	/**
	 * Read cursor management for the task_output tool: returns the current
	 * read offset and advances it to the end of what has been written so far.
	 */
	consumeReadOffset(taskId: string): { offset: number; end: number } | undefined {
		const task = this.tasks.get(taskId);
		if (!task) return undefined;
		const result = { offset: task.readOffset, end: task.writtenBytes };
		task.readOffset = task.writtenBytes;
		return result;
	}

	/**
	 * Kill a running task's process tree.
	 * @param reason Recorded on the snapshot when the process ends (`endedBy`),
	 *   so UI/agent notifications can distinguish user stop vs agent task_stop.
	 * @returns false if not found or already ended.
	 */
	kill(taskId: string, reason?: BackgroundTaskEndedBy): boolean {
		const task = this.tasks.get(taskId);
		if (!task || task.ended) return false;
		if (reason) task.killReason = reason;
		if (task.child.pid) {
			killProcessTree(task.child.pid);
		} else {
			task.child.kill();
		}
		return true;
	}

	/**
	 * Remove all finished (non-running) tasks from the registry.
	 * Driven by the UI's "clear finished" action. Returns the number removed.
	 */
	clearFinished(): number {
		let removed = 0;
		for (const [id, task] of this.tasks) {
			if (task.snapshot.status !== "running") {
				this.tasks.delete(id);
				removed++;
			}
		}
		if (removed > 0) {
			this.emit({ type: "tasks_cleared" });
		}
		return removed;
	}

	/** Kill all running tasks. Called on session dispose. */
	killAll(): void {
		for (const [id, task] of this.tasks) {
			if (!task.ended) {
				this.kill(id, "dispose");
			}
		}
	}
}

/** Build the <task-notification> XML injected into the agent loop on completion. */
export function buildTaskNotification(task: BackgroundTaskSnapshot): string {
	const statusText =
		task.status === "completed"
			? `completed (exit code ${task.exitCode ?? 0})`
			: task.status === "killed"
				? task.endedBy === "user"
					? "was terminated by the user from the UI"
					: "was killed"
				: `failed (exit code ${task.exitCode ?? "unknown"})`;
	const summary = `Background command "${task.command}" ${statusText}`;
	const userStopNote =
		task.status === "killed" && task.endedBy === "user"
			? "The user manually stopped this background task. Do not restart it unless the user asks."
			: undefined;
	return [
		"<task-notification>",
		`<task-id>${task.id}</task-id>`,
		...(task.toolCallId ? [`<tool-use-id>${task.toolCallId}</tool-use-id>`] : []),
		`<status>${task.status}</status>`,
		...(task.endedBy ? [`<ended-by>${task.endedBy}</ended-by>`] : []),
		`<output-file>${task.outputFile}</output-file>`,
		`<summary>${summary}</summary>`,
		"</task-notification>",
		"",
		...(userStopNote ? [userStopNote, ""] : []),
		"Use the task_output tool to read the command output if needed.",
	].join("\n");
}
