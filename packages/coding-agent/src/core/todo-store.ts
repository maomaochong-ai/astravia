/**
 * TodoStore — in-memory todo list with session JSONL persistence.
 *
 * Storage strategy:
 * - Runtime: items kept in a plain array (fast reads)
 * - Persistence: on every mutation a "todo_snapshot" CustomEntry is appended
 *   to the SessionManager so it survives process restarts
 * - Recovery: on session resume, replay the latest todo_snapshot entry
 */

export interface TodoItem {
	id: number;
	content: string;
	status: "pending" | "in_progress" | "done";
}

/**
 * 谁锁定了这份待办。锁定 = 宿主预填了权威计划，agent 只能按序做完，
 * 不得新建/清空/乱序/提前收工。当前唯一来源是知识库批量加工。
 */
export type TodoLockSource = "host";

export interface TodoSnapshotEnvelope {
	items: TodoItem[];
	lockedBy: TodoLockSource | null;
}

/**
 * Snapshot payload persisted in session JSONL.
 *
 * Legacy snapshots written before the lock mechanism are plain `TodoItem[]`.
 * `restoreFromSnapshot` accepts both shapes for backward compatibility.
 */
export type TodoSnapshot = TodoSnapshotEnvelope | TodoItem[];

export type TodoUpdateListener = (items: ReadonlyArray<TodoItem>) => void;

export const TODO_SNAPSHOT_TYPE = "todo_snapshot";

export class TodoStore {
	private items: TodoItem[] = [];
	private nextId = 1;
	private lockedBy: TodoLockSource | null = null;
	private listeners: Set<TodoUpdateListener> = new Set();
	/** Optional callback to persist snapshot to session JSONL */
	private persistFn?: (snapshot: TodoSnapshotEnvelope) => void;

	/**
	 * @param persistFn Called on every mutation to write a snapshot to session JSONL.
	 */
	constructor(persistFn?: (snapshot: TodoSnapshotEnvelope) => void) {
		this.persistFn = persistFn;
	}

	/** Replace persist function (e.g., after session switch). */
	setPersistFn(fn: (snapshot: TodoSnapshotEnvelope) => void): void {
		this.persistFn = fn;
	}

	// ── Queries ──────────────────────────────────────────────

	getAll(): ReadonlyArray<TodoItem> {
		return this.items;
	}

	get(id: number): TodoItem | undefined {
		return this.items.find((t) => t.id === id);
	}

	isLocked(): boolean {
		return this.lockedBy !== null;
	}

	getLockSource(): TodoLockSource | null {
		return this.lockedBy;
	}

	// ── Mutations ─────────────────────────────────────────────

	/** Create multiple items at once. Returns created items. */
	createMany(contents: string[]): TodoItem[] {
		const created: TodoItem[] = [];
		for (const content of contents) {
			const item: TodoItem = { id: this.nextId++, content, status: "pending" };
			this.items.push(item);
			created.push(item);
		}
		this._afterMutation();
		return created;
	}

	/** Update status of one item. Returns the updated item or undefined if not found. */
	update(id: number, status: TodoItem["status"]): TodoItem | undefined {
		const item = this.items.find((t) => t.id === id);
		if (!item) return undefined;
		item.status = status;
		this._afterMutation();
		return item;
	}

	/** Clear all items, reset ID counter, and release any active lock. */
	clear(): void {
		this.items = [];
		this.nextId = 1;
		this.lockedBy = null;
		this._afterMutation();
	}

	/** Lock the store so external creators (e.g., the LLM) cannot append items. */
	lock(source: TodoLockSource): void {
		if (this.lockedBy === source) return;
		this.lockedBy = source;
		this._afterMutation();
	}

	// ── Restore from snapshot ─────────────────────────────────

	/** Restore state from a persisted snapshot (e.g., on session resume). */
	restoreFromSnapshot(snapshot: TodoSnapshot): void {
		const items = Array.isArray(snapshot) ? snapshot : snapshot.items;
		const lockedBy = Array.isArray(snapshot) ? null : (snapshot.lockedBy ?? null);
		this.items = items.map((item) => ({ ...item }));
		this.nextId = this.items.length > 0 ? Math.max(...this.items.map((t) => t.id)) + 1 : 1;
		this.lockedBy = lockedBy;
		this._notify();
	}

	// ── Subscriptions ─────────────────────────────────────────

	subscribe(listener: TodoUpdateListener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	// ── Internal ──────────────────────────────────────────────

	private _afterMutation(): void {
		this._persist();
		this._notify();
	}

	private _persist(): void {
		this.persistFn?.({
			items: this.items.map((item) => ({ ...item })),
			lockedBy: this.lockedBy,
		});
	}

	private _notify(): void {
		for (const listener of this.listeners) {
			try {
				listener(this.items);
			} catch {
				// Ignore listener errors
			}
		}
	}
}
