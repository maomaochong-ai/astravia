import type { PluginCommandApi } from "@astravia-org/plugin-sdk";
import type { ChangeCode, TurnChangeDelta } from "./types";

/**
 * Module Federation may duplicate this module across remote/host boundaries, so
 * shared mutable runtime state hangs on globalThis (see the host's plugin notes
 * about MF module singletons). Holds the command API and a refresh signal bus.
 */
/** Resize the activity panel that hosts the Git tab (px or "max"); omit to keep current width. */
export type PanelResizer = (width?: number | "max") => void;

/** Agent turn lifecycle phase, surfaced from `ctx.conversation.on` to plugin components. */
export type TurnPhase = "start" | "end";

/**
 * Per-cwd turn-card state, persisted on the runtime so it survives session
 * switches and component remounts: `baseline` = git status before the current
 * turn (to diff against), `delta` = the last computed "this turn's changes" to
 * re-show when the user switches back to this conversation.
 */
interface TurnCardState {
	baseline: Map<string, ChangeCode> | null;
	delta: TurnChangeDelta | null;
}

interface GitRuntime {
	command: PluginCommandApi | null;
	resizePanel: PanelResizer | null;
	refreshListeners: Set<() => void>;
	turnPhaseListeners: Set<(phase: TurnPhase) => void>;
	turnCardStates: Map<string, TurnCardState>;
}

const KEY = "__astraviaGitPluginRuntime__";

function runtime(): GitRuntime {
	const g = globalThis as Record<string, unknown>;
	if (!g[KEY]) {
		g[KEY] = {
			command: null,
			resizePanel: null,
			refreshListeners: new Set<() => void>(),
			turnPhaseListeners: new Set<(phase: TurnPhase) => void>(),
			turnCardStates: new Map<string, TurnCardState>(),
		} satisfies GitRuntime;
	}
	return g[KEY] as GitRuntime;
}

function turnCardState(cwd: string): TurnCardState {
	const states = runtime().turnCardStates;
	let state = states.get(cwd);
	if (!state) {
		state = { baseline: null, delta: null };
		states.set(cwd, state);
	}
	return state;
}

/** Read the persisted pre-turn baseline for a cwd (null = not yet established). */
export function getTurnBaseline(cwd: string): Map<string, ChangeCode> | null {
	return turnCardState(cwd).baseline;
}

export function setTurnBaseline(cwd: string, baseline: Map<string, ChangeCode> | null): void {
	turnCardState(cwd).baseline = baseline;
}

/** Read the persisted last-turn change delta for a cwd (re-shown on session switch-back). */
export function getTurnDelta(cwd: string): TurnChangeDelta | null {
	return turnCardState(cwd).delta;
}

export function setTurnDelta(cwd: string, delta: TurnChangeDelta | null): void {
	turnCardState(cwd).delta = delta;
}

export function setGitCommand(api: PluginCommandApi): void {
	runtime().command = api;
}

export function getGitCommand(): PluginCommandApi {
	const api = runtime().command;
	if (!api) throw new Error("Git plugin command API not initialized");
	return api;
}

/** Register the host-backed panel resizer (wired in activate from ctx.ui). */
export function setPanelResizer(resize: PanelResizer): void {
	runtime().resizePanel = resize;
}

/** Resize the activity panel (no-op until the resizer is registered). */
export function resizePanel(width?: number | "max"): void {
	runtime().resizePanel?.(width);
}

/** Subscribe a panel to global refresh signals (turn-end, etc). Returns unsubscribe. */
export function onRefreshSignal(listener: () => void): () => void {
	const set = runtime().refreshListeners;
	set.add(listener);
	return () => set.delete(listener);
}

/** Fire a refresh signal to all mounted panels. */
export function emitRefreshSignal(): void {
	for (const listener of runtime().refreshListeners) listener();
}

/**
 * Subscribe to agent turn lifecycle phases (start / end). The turn card uses
 * this to snapshot a baseline at turn-start and diff against it at turn-end so
 * it shows only THIS turn's changes (not all pre-existing uncommitted files).
 */
export function onTurnPhase(listener: (phase: TurnPhase) => void): () => void {
	const set = runtime().turnPhaseListeners;
	set.add(listener);
	return () => set.delete(listener);
}

/** Fire a turn lifecycle phase to subscribers. */
export function emitTurnPhase(phase: TurnPhase): void {
	for (const listener of runtime().turnPhaseListeners) listener(phase);
}
