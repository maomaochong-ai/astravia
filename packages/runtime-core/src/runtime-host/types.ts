import type { AgentSession, ConversationScenario, ModelRegistry } from "@astravia/coding-agent";
import type {
	AgentPluginRuntimeConfig,
	RuntimeSandboxGrantDecision,
	RuntimeSandboxGrantRequest,
	RuntimeUserConfirmationRequest,
	RuntimeUserQuestionRequest,
	RuntimeUserQuestionResult,
	SessionExecutionMode,
} from "../contracts.js";

export interface SessionHandle {
	session: AgentSession;
	executionMode: SessionExecutionMode;
	agentPluginsEnabled: boolean;
	pendingAgentPlugins: AgentPluginRuntimeConfig | undefined;
	hasPendingAgentPlugins: boolean;
	/** 本会话解析后的对话场景（缺省回落 DEFAULT_SCENARIO），getState 回传给 renderer。 */
	scenario: ConversationScenario;
	/** 当前生效的工作模式（agent_mode 轴）。undefined = 不过滤。见 ADR-0046。 */
	agentMode: string | undefined;
	/** 全局切换 mode 时挂起，于下一个 turn 边界 apply（避免 streaming 中途换工具集）。 */
	pendingAgentMode: string | undefined;
	hasPendingAgentMode: boolean;
	/**
	 * 空闲期提前 apply 挂起插件配置的合并定时器。插件 activate 会逐个工具打
	 * reconfigure，这里做防抖，避免一次激活重建 N 次 runtime。
	 */
	idleAgentPluginTimer: ReturnType<typeof setTimeout> | undefined;
	/**
	 * 正在进行中的 apply。prompt 侧先 await 它，避免空闲期定时 apply 与一次新 prompt
	 * 撞在一起、让本回合跑在重建到一半的工具集上。
	 */
	agentPluginApplyInFlight: Promise<void> | undefined;
	/** 上次广播出去的激活工具集（join 后的字符串），用于去重 active_tools_update。 */
	lastBroadcastActiveToolNames: string | undefined;
}

/**
 * Per-session buffer of the currently-streaming LLM call's deltas.
 *
 * The runtime persists assistant messages to the JSONL history only on
 * `message_end`. So if a renderer disconnects mid-stream and reconnects
 * (e.g. user switches sessions and switches back), `getFullHistory` returns
 * nothing for the in-flight assistant, and a fresh `subscribe()` only forwards
 * future events. Without this buffer, all text/thinking/tool-call events
 * received before reconnection would be lost.
 *
 * Text and thinking are cleared on `message_end` because each LLM call inside
 * a multi-step turn produces its own deltas; the prior call's content is
 * already on disk via `message.final`. `isActive` flips on at `agent_start`
 * and off at `agent_end`.
 */
export interface InFlightBuffer {
	turnStartedAt: number;
	text: string;
	thinking: string;
	toolCallStarts: Array<{ toolCallId: string; toolName: string }>;
	isActive: boolean;
}

/**
 * running-changed 广播的回合结束语义。仅 "agent_end"（自然结束）会触发 renderer
 * 侧的消息队列出队；"aborted" / "error" 保留队列不出队。session 销毁等非回合结束
 * 的 markRunning(false) 不带 reason（undefined）。
 */
export type RunningChangedReason = "agent_end" | "aborted" | "error";

export interface RuntimeHostOptions {
	getDefaultExecutionMode?: () => SessionExecutionMode | Promise<SessionExecutionMode>;
	additionalSkillPaths?: string[];
	sandboxHostPath?: string;
	linuxBubblewrapPath?: string;
	macosSandboxExecPath?: string;
	userConfirmationHandler?: (request: RuntimeUserConfirmationRequest, signal?: AbortSignal) => Promise<boolean>;
	userQuestionHandler?: (
		request: RuntimeUserQuestionRequest,
		signal?: AbortSignal,
	) => Promise<RuntimeUserQuestionResult>;
	userSandboxGrantHandler?: (
		request: RuntimeSandboxGrantRequest,
		signal?: AbortSignal,
	) => Promise<RuntimeSandboxGrantDecision>;
	/**
	 * 进程级共享的 ModelRegistry。注入后每次 createSession 都复用同一份，
	 * 避免每个会话各自重新加载 models.json。
	 */
	modelRegistry?: ModelRegistry;
}
