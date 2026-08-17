/**
 * Shared context handed to AgentSession sub-controllers.
 *
 * Controllers (compaction, retry, …) own their own state slices but still need
 * to reach back into the session facade for cross-cutting concerns: the agent,
 * persistence, event emission, the current model / extension runner, and the
 * connect/disconnect + abort lifecycle hooks. This interface is that seam.
 *
 * `model` and `extensionRunner` are accessors because they change at runtime
 * (model switching, runtime rebuilds) — implementers must read them live.
 */

import type { Agent } from "@astravia/agent-core";
import type { Model } from "@astravia/ai";
import type { AgentSessionEvent } from "../agent-session.js";
import type { ExtensionRunner } from "../extensions/index.js";
import type { EcosystemHookRuntime } from "../hooks/index.js";
import type { ModelRegistry } from "../model-registry.js";
import type { SessionManager } from "../session-manager/index.js";
import type { SettingsManager } from "../settings-manager.js";

export interface SessionContext {
	readonly agent: Agent;
	readonly sessionManager: SessionManager;
	readonly settingsManager: SettingsManager;
	readonly modelRegistry: ModelRegistry;
	readonly cwd: string;
	readonly hookRuntime: EcosystemHookRuntime;

	/** Current model (changes on model switch). */
	readonly model: Model<any> | undefined;
	/** Current extension runner (rebuilt by _buildRuntime). */
	readonly extensionRunner: ExtensionRunner | undefined;

	// memory-mode (ADR-0009)
	readonly memoryMode: boolean;
	readonly memoryFile: string | undefined;
	readonly memoryCharLimit: number;
	readonly memorySnapshot: string;

	/** Emit a session event to listeners. */
	emit(event: AgentSessionEvent): void;
	/** Abort the current agent operation. */
	abort(): Promise<void>;
	/** Temporarily detach internal agent-event handling. */
	disconnectFromAgent(): void;
	/** Reattach internal agent-event handling. */
	reconnectToAgent(): void;
}
