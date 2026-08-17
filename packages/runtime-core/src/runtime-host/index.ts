/**
 * RuntimeHost 模块入口。
 *
 * 目录职责：
 * - runtime-host.ts      会话生命周期与编排（SessionFacade）
 * - session-events.ts    AgentSessionEvent → SessionEvent 映射
 * - history.ts           会话历史 / 分支 / turn timing 解析
 * - peripheral-tasks.ts  自动标题、输入预测（轻量 LLM + 失败轮转）
 * - plugin-debug.ts      插件调试日志
 * - types.ts             共享类型
 */
export { RuntimeHost } from "./runtime-host.js";
export type { RunningChangedReason, RuntimeHostOptions } from "./types.js";
