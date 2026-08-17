import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { getAgentDir } from "../config.js";

/**
 * A key combination identifier (e.g. "ctrl+c", "shift+tab").
 *
 * Previously imported from @mariozechner/pi-tui as a precise template-literal
 * union. The TUI product was removed; we keep the looser `string` alias so the
 * (still-shipping) extension shortcut API and keybindings config keep working
 * without the deleted package.
 */
export type KeyId = string;

/**
 * Editor-level actions. Internalized from the former pi-tui keybindings module —
 * still referenced by the extension keybindings contract even though the
 * built-in terminal editor is gone.
 */
export type EditorAction =
	| "cursorUp"
	| "cursorDown"
	| "cursorLeft"
	| "cursorRight"
	| "cursorWordLeft"
	| "cursorWordRight"
	| "cursorLineStart"
	| "cursorLineEnd"
	| "jumpForward"
	| "jumpBackward"
	| "pageUp"
	| "pageDown"
	| "deleteCharBackward"
	| "deleteCharForward"
	| "deleteWordBackward"
	| "deleteWordForward"
	| "deleteToLineStart"
	| "deleteToLineEnd"
	| "newLine"
	| "submit"
	| "tab"
	| "selectUp"
	| "selectDown"
	| "selectPageUp"
	| "selectPageDown"
	| "selectConfirm"
	| "selectCancel"
	| "copy"
	| "yank"
	| "yankPop"
	| "undo"
	| "expandTools"
	| "toggleSessionPath"
	| "toggleSessionSort"
	| "renameSession"
	| "deleteSession"
	| "deleteSessionNoninvasive";

export type EditorKeybindingsConfig = {
	[K in EditorAction]?: KeyId | KeyId[];
};

/**
 * Default editor keybindings (internalized from pi-tui).
 */
export const DEFAULT_EDITOR_KEYBINDINGS: Required<EditorKeybindingsConfig> = {
	cursorUp: "up",
	cursorDown: "down",
	cursorLeft: ["left", "ctrl+b"],
	cursorRight: ["right", "ctrl+f"],
	cursorWordLeft: ["alt+left", "ctrl+left", "alt+b"],
	cursorWordRight: ["alt+right", "ctrl+right", "alt+f"],
	cursorLineStart: ["home", "ctrl+a"],
	cursorLineEnd: ["end", "ctrl+e"],
	jumpForward: "ctrl+]",
	jumpBackward: "ctrl+alt+]",
	pageUp: "pageUp",
	pageDown: "pageDown",
	deleteCharBackward: "backspace",
	deleteCharForward: ["delete", "ctrl+d"],
	deleteWordBackward: ["ctrl+w", "alt+backspace"],
	deleteWordForward: ["alt+d", "alt+delete"],
	deleteToLineStart: "ctrl+u",
	deleteToLineEnd: "ctrl+k",
	newLine: "shift+enter",
	submit: "enter",
	tab: "tab",
	selectUp: "up",
	selectDown: "down",
	selectPageUp: "pageUp",
	selectPageDown: "pageDown",
	selectConfirm: "enter",
	selectCancel: ["escape", "ctrl+c"],
	copy: "ctrl+c",
	yank: "ctrl+y",
	yankPop: "alt+y",
	undo: "ctrl+-",
	expandTools: "ctrl+o",
	toggleSessionPath: "ctrl+p",
	toggleSessionSort: "ctrl+s",
	renameSession: "ctrl+r",
	deleteSession: "ctrl+d",
	deleteSessionNoninvasive: "ctrl+backspace",
};

/**
 * Application-level actions (coding agent specific).
 */
export type AppAction =
	| "interrupt"
	| "clear"
	| "exit"
	| "suspend"
	| "cycleThinkingLevel"
	| "cycleModelForward"
	| "cycleModelBackward"
	| "selectModel"
	| "expandTools"
	| "toggleThinking"
	| "toggleSessionNamedFilter"
	| "externalEditor"
	| "followUp"
	| "dequeue"
	| "pasteImage"
	| "newSession"
	| "tree"
	| "fork"
	| "resume";

/**
 * All configurable actions.
 */
export type KeyAction = AppAction | EditorAction;

/**
 * Full keybindings configuration (app + editor actions).
 */
export type KeybindingsConfig = {
	[K in KeyAction]?: KeyId | KeyId[];
};

/**
 * Default application keybindings.
 */
export const DEFAULT_APP_KEYBINDINGS: Record<AppAction, KeyId | KeyId[]> = {
	interrupt: "escape",
	clear: "ctrl+c",
	exit: "ctrl+d",
	suspend: "ctrl+z",
	cycleThinkingLevel: "shift+tab",
	cycleModelForward: "ctrl+p",
	cycleModelBackward: "shift+ctrl+p",
	selectModel: "ctrl+l",
	expandTools: "ctrl+o",
	toggleThinking: "ctrl+t",
	toggleSessionNamedFilter: "ctrl+n",
	externalEditor: "ctrl+g",
	followUp: "alt+enter",
	dequeue: "alt+up",
	pasteImage: "ctrl+v",
	newSession: [],
	tree: [],
	fork: [],
	resume: [],
};

/**
 * All default keybindings (app + editor).
 */
export const DEFAULT_KEYBINDINGS: Required<KeybindingsConfig> = {
	...DEFAULT_EDITOR_KEYBINDINGS,
	...DEFAULT_APP_KEYBINDINGS,
};

// App actions list for type checking
const APP_ACTIONS: AppAction[] = [
	"interrupt",
	"clear",
	"exit",
	"suspend",
	"cycleThinkingLevel",
	"cycleModelForward",
	"cycleModelBackward",
	"selectModel",
	"expandTools",
	"toggleThinking",
	"toggleSessionNamedFilter",
	"externalEditor",
	"followUp",
	"dequeue",
	"pasteImage",
	"newSession",
	"tree",
	"fork",
	"resume",
];

function isAppAction(action: string): action is AppAction {
	return APP_ACTIONS.includes(action as AppAction);
}

/**
 * Manages all keybindings (app + editor).
 */
export class KeybindingsManager {
	private config: KeybindingsConfig;
	private appActionToKeys: Map<AppAction, KeyId[]>;

	private constructor(config: KeybindingsConfig) {
		this.config = config;
		this.appActionToKeys = new Map();
		this.buildMaps();
	}

	/**
	 * Create from config file and set up editor keybindings.
	 */
	static create(agentDir: string = getAgentDir()): KeybindingsManager {
		const configPath = join(agentDir, "keybindings.json");
		const config = KeybindingsManager.loadFromFile(configPath);
		return new KeybindingsManager(config);
	}

	/**
	 * Create in-memory.
	 */
	static inMemory(config: KeybindingsConfig = {}): KeybindingsManager {
		return new KeybindingsManager(config);
	}

	private static loadFromFile(path: string): KeybindingsConfig {
		if (!existsSync(path)) return {};
		try {
			return JSON.parse(readFileSync(path, "utf-8"));
		} catch {
			return {};
		}
	}

	private buildMaps(): void {
		this.appActionToKeys.clear();

		// Set defaults for app actions
		for (const [action, keys] of Object.entries(DEFAULT_APP_KEYBINDINGS)) {
			const keyArray = Array.isArray(keys) ? keys : [keys];
			this.appActionToKeys.set(action as AppAction, [...keyArray]);
		}

		// Override with user config (app actions only)
		for (const [action, keys] of Object.entries(this.config)) {
			if (keys === undefined || !isAppAction(action)) continue;
			const keyArray = Array.isArray(keys) ? keys : [keys];
			this.appActionToKeys.set(action, keyArray);
		}
	}

	/**
	 * Get keys bound to an app action.
	 */
	getKeys(action: AppAction): KeyId[] {
		return this.appActionToKeys.get(action) ?? [];
	}

	/**
	 * Get the full effective config.
	 */
	getEffectiveConfig(): Required<KeybindingsConfig> {
		const result = { ...DEFAULT_KEYBINDINGS };
		for (const [action, keys] of Object.entries(this.config)) {
			if (keys !== undefined) {
				(result as KeybindingsConfig)[action as KeyAction] = keys;
			}
		}
		return result;
	}
}
