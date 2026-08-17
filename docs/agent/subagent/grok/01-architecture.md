# 01 — 分层架构与核心对象

## 1. 设计目标

Grok Build 把「可并行的、上下文昂贵的工作」从主会话上下文中**剥离**出去：

1. **上下文隔离**：子 Agent 有独立 conversation / context window，不挤占主 Agent 的 prompt 预算。
2. **资源共享**：文件系统、终端后端、hunk tracker、env、MCP pool、hooks 等与父会话共享，避免重复初始化，并保证编辑可见性一致。
3. **扁平协作树**：最大嵌套深度为 1（`MAX_SUBAGENT_DEPTH = 1`），防止子 Agent 再无限派生子 Agent。
4. **可观测、可恢复**：每个子 Agent 有 UUID、meta 落盘、ACP 通知、可选 worktree 与 resume。

官方表述见：`crates/codegen/xai-grok-pager/docs/user-guide/16-subagents.md`。

## 2. 逻辑分层

```
┌─────────────────────────────────────────────────────────────────┐
│  模型层（LLM）                                                    │
│  主 Agent 决定何时 spawn / 等结果 / kill；子 Agent 自治跑任务       │
├─────────────────────────────────────────────────────────────────┤
│  工具层（xai-grok-tools）                                          │
│  TaskTool / TaskOutputTool / KillTaskTool / WaitTasksTool        │
│  + SubagentBackend 抽象 + Reminder 完成提示                        │
├─────────────────────────────────────────────────────────────────┤
│  协调层（xai-grok-shell · SubagentCoordinator）                    │
│  pending / active / completed 三态表 · 查询 · 取消 · 完成缓冲      │
├─────────────────────────────────────────────────────────────────┤
│  编排层（handle_subagent_request）                                  │
│  类型解析 · role/persona · worktree · 建子 Session · 跑 prompt     │
├─────────────────────────────────────────────────────────────────┤
│  解析层（xai-grok-subagent-resolution）                            │
│  纯逻辑：override 优先级 · persona 指令加载 · resume 身份校验       │
├─────────────────────────────────────────────────────────────────┤
│  会话层（SessionActor / SessionHandle）                            │
│  子会话与主会话同构：turn 循环、工具执行、compaction、持久化          │
├─────────────────────────────────────────────────────────────────┤
│  定义层（xai-grok-agent · AgentDefinition / prompts）              │
│  general-purpose / explore / plan 工具集与 system prompt           │
└─────────────────────────────────────────────────────────────────┘
```

## 3. 关键 crate 与模块

### 3.1 `xai-tool-types` — 跨边界的稳定类型

路径：`crates/common/xai-tool-types/src/task.rs`

- 模型参数：`TaskToolInput`（prompt、description、subagent_type、background、capability_mode、isolation、resume_from、cwd、model…）
- 能力与隔离枚举：`SubagentCapabilityMode`、`SubagentIsolationMode`
- 完成输出：`SubagentCompletedOutput` 及 `format_subagent_completed` / `format_subagent_started_background`
- 内置类型目录：`GENERAL_PURPOSE_SUBAGENT` / `EXPLORE_SUBAGENT` / `PLAN_SUBAGENT` 与对应 prompt 正文
- 动态工具描述：`build_task_description`

该 crate **不依赖** shell 会话实现，保证 tools 与 shell 共享同一 schema。

### 3.2 `xai-grok-tools` — 工具实现与 backend

| 路径 | 内容 |
|---|---|
| `.../implementations/grok_build/task/mod.rs` | `TaskTool`：深度门禁、类型校验、前台 await / 后台 fire-and-forget |
| `.../task/backend.rs` | `SubagentBackend` trait；`ChannelBackend` 走 mpsc |
| `.../task/types.rs` | `SubagentEvent` 全家桶、`SubagentRequest`/`Result`/`Snapshot` |
| `.../task_output/` | 查询/等待后台任务与 subagent 输出 |
| `.../kill_task/` | 取消 bash 任务 / monitor / subagent |
| `.../reminders/task_completion.rs` | 工具结果后注入完成 reminder |

**深度常量**：

```rust
// crates/codegen/xai-grok-tools/src/implementations/grok_build/task/mod.rs
pub const MAX_SUBAGENT_DEPTH: u32 = 1;
```

顶层 session depth=0；第一次 spawn 的子 Agent depth=1；子 Agent 再调 `task` 会在工具层直接报错。

### 3.3 `xai-grok-shell` — 真正的编排与会话

| 路径 | 内容 |
|---|---|
| `src/agent/subagent/mod.rs` | `SubagentCoordinator`、`SubagentSpawnContext`、`SubagentTracker`、`CompletedSubagent`、auto-wake 决策 |
| `src/agent/subagent/handle_request.rs` | `handle_subagent_request`：spawn 主流程（上千行） |
| `src/agent/subagent/coordinator_lifecycle.rs` | insert_pending / promote / move_to_completed / usage fold |
| `src/agent/subagent/coordinator_query.rs` | lookup、block wait、list、evict（30 分钟 TTL） |
| `src/agent/mvp_agent/subagent_coordinator.rs` | `MvpAgent::start_subagent_coordinator`：drain `SubagentEvent` |

设计注释（`subagent/mod.rs` 文件头）明确：

- Coordinator 拥有 active map，作为 `MvpAgent` 的字段。
- `handle_subagent_request` 是 **自由函数**，只拿 `SubagentSpawnContext`，**不直接 borrow `MvpAgent`**。
- 子会话共享父的 hunk tracker、filesystem、terminal、env。

### 3.4 `xai-grok-subagent-resolution` — 纯配置解析

路径：`crates/codegen/xai-grok-subagent-resolution/src/`

| 文件 | 职责 |
|---|---|
| `lib.rs` | crate 说明与 re-export |
| `overrides.rs` | `resolve_effective_overrides`：explicit > role > persona > parent |
| `resume.rs` | resume 时 type/persona 身份校验 |
| `config.rs` | `SubagentRole` / `SubagentPersona` 结构 |
| `types.rs` | `EffectiveRuntimeConfig` 等 |

无 session / transport 依赖，便于未来 remote spawn 复用。

### 3.5 `xai-grok-agent` — 定义、改名、prompt

| 路径 | 职责 |
|---|---|
| `src/config.rs` | `AgentDefinition`；builtin explore/plan/general-purpose；`task`→`spawn_subagent` 改名 |
| `src/builder.rs` | 组装 toolset + `build_task_description`；子会话用精简版 `CHILD_TASK_DESCRIPTION` |
| `templates/subagent_prompt.md` | 子 Agent 系统提示骨架（工具调用规范、project instructions 规则等） |
| `src/prompt/subagent_prompts.rs` | 从 `xai-tool-types` re-export builtin prompt |

### 3.6 `xai-grok-pager` — UI 与用户文档

- 用户文档：`docs/user-guide/16-subagents.md`
- TUI：`src/app/subagent.rs`、`src/scrollback/blocks/subagent.rs`、`src/views/subagent_catalog_pane.rs`

## 4. 核心对象

### 4.1 `SubagentRequest`（工具 → 协调器）

定义：`xai-grok-tools/.../task/types.rs`

关键字段：

| 字段 | 含义 |
|---|---|
| `id` | UUID v7；同时是 child session id |
| `prompt` / `description` | 任务正文与短标签 |
| `subagent_type` | `general-purpose` / `explore` / `plan` / 自定义 |
| `parent_session_id` / `parent_prompt_id` | 父会话与发起 turn 的 prompt，用于按 turn 取消与计费 |
| `resume_from` / `cwd` | 恢复与工作目录 |
| `runtime_overrides` | model、capability、isolation、persona、harness_agent_type… |
| `run_in_background` | 后台立即返回 vs 前台 await |
| `surface_completion` | 是否进入 idle 完成提醒（goal 内部 harness 子 Agent 可 false） |
| `fork_context` | harness 专用：用父对话前缀 fork（非模型 Task 参数） |
| `result_tx` | oneshot 回传 `SubagentResult` |

### 4.2 `SubagentSpawnContext`（父会话快照 → spawn 函数）

定义：`xai-grok-shell/src/agent/subagent/mod.rs`

这是一个**大参数袋**，刻意避免 `handle_subagent_request` 依赖整个 `MvpAgent`。内容大致分几类：

1. **身份与深度**：`parent_session_id`、`parent_depth`、`parent_agent_name`
2. **共享执行资源**：`fs`、`terminal`、`parent_terminal_backend`、`hunk_tracker_handle`、`session_env`、`lsp`
3. **配置与模型**：`sampling_config`、`available_models`、`subagent_model_overrides`、`subagent_toggle`、`agent_config`
4. **角色系统**：`subagent_roles`、`subagent_personas`、`allowed_subagent_types`
5. **MCP / 工具**：`parent_mcp_pool`、`parent_tool_snapshot`、`parent_skills`
6. **协作开关**：`auto_wake_enabled`、`goal_loop_active`、`parent_blocking_wait_depth`、`task_output_tool_name`
7. **通知通道**：`parent_cmd_tx`、`subagent_event_tx`、`client_hooks`

spawn 前 `start_subagent_coordinator` 还会异步 snapshot 父会话的 MCP pool、client hooks、tool definitions。

### 4.3 `SubagentCoordinator` 三态表

```
pending  ──promote──►  active  ──move_to_completed──►  completed
  │                      │                                 │
  │ 初始化中             │ 子 Session 已在跑               │ 可 query / resume
  │ (建 worktree 等)     │ 持有 SessionHandle              │ 30 分钟 TTL 驱逐
```

| 结构 | 含义 |
|---|---|
| `PendingSubagent` | 已分配 id，尚未拿到 child handle |
| `SubagentTracker` | 运行中：handle、cancel_token、cwd、worktree、model… |
| `CompletedSubagent` | 终态结果 + 用于 resume 的 cwd/worktree/snapshot_ref |

辅助状态：

- `pending_completions`：供 between-turn drain 的摘要缓冲
- `block_wait_slots`：前台 `get_task_output` 阻塞等待时的 oneshot 槽
- `running_gauge`：busy 判定 / 延迟自动更新关闭
- `subagent_usage_not_applied_prompts`：token 折算未进父账单时的 incomplete 标记
- `is_turn_active`：与父 turn 边界同步

### 4.4 `SubagentBackend` 抽象

```
TaskTool ──► SubagentBackendResource(Arc<dyn SubagentBackend>)
                      │
                      ▼
              ChannelBackend ──mpsc──► MvpAgent drain loop
```

当前仅实现 `ChannelBackend`（进程内）。`backend.rs` 注释规划了未来的 `RemoteBackend`（跨进程 spawn）。工具层只依赖 trait，不直接碰 coordinator。

### 4.5 子 Session 与主 Session 的同构性

子 Agent **复用** `SessionThread` / `SessionHandle` / `SessionActor` 路径：

- 独立 `child_session_id`（= subagent_id）
- 独立 persistence 目录与 `SubagentMeta` 落盘
- 独立 sampling client / credentials 继承链
- 独立 tool context，但 `subagent_depth = parent_depth + 1`，且通常 **剥离 Task 工具**（达到 max depth 时）

因此「子 Agent 能做什么」在实现上 = 「其 `AgentDefinition.tool_config` + capability filter + depth 规则允许什么」。

## 5. 端到端数据流（概览）

```
1. 主模型发出 tool_call: spawn_subagent{ prompt, description, subagent_type, background, ... }
2. TaskTool.run:
   - depth >= 1 → 拒绝
   - backend.validate_type
   - 生成 UUID id
   - background=true → tokio::spawn(backend.spawn) 并立即返回 started 文案
   - background=false → await backend.spawn 直到 SubagentResult
3. ChannelBackend: SubagentEvent::Spawn → coordinator 通道
4. MvpAgent drain: spawn_local { build_subagent_spawn_context; handle_subagent_request }
5. handle_subagent_request:
   - resolve AgentDefinition / gate toggle / resolve overrides
   - 可选 worktree / resume transcript
   - 创建子 Session，注入 prompt，跑到完成
   - fold usage、reparent 后台任务、可选 snapshot worktree
   - move_to_completed；按条件 auto-wake；result_tx 回传
6. 主模型侧:
   - 前台：tool result 即为完整输出 + <subagent_meta> + resume footer
   - 后台：started 文案；之后 auto-wake 或 get_command_or_subagent_output / reminder
```

更细的步骤见 [02-dispatch-and-lifecycle.md](02-dispatch-and-lifecycle.md)。

## 6. 配置入口

| 入口 | 作用 |
|---|---|
| env `GROK_SUBAGENTS=0` | 全局禁用 subagent |
| `config.toml [subagents] enabled` | 同上 |
| `[subagents.toggle].explore = false` | 按类型禁用 |
| `[subagents.models].explore = "..."` | 按类型钉模型 |
| `[subagents.roles.*]` / `.grok/roles/*.toml` | 自定义 role |
| `[subagents.personas.*]` / `.grok/personas/*.toml` | persona 叠加 |
| `.grok/agents/*.md` / `~/.grok/agents/` | 自定义 agent 定义（可 shadow builtin） |
| CLI `--no-subagents` / `--agents` / `--disallowed-tools Agent(...)` | 会话级控制 |
| `GROK_AUTO_WAKE` / features.auto_wake | 完成后是否合成 prompt 唤醒主 Agent |
| `GROK_SUBAGENT_WORKTREE_SNAPSHOT` | 完成后是否 snapshot 并删除 worktree |

## 7. 架构要点小结

1. **工具层与协调层解耦**：`SubagentBackend` + 单一 `SubagentEvent` 通道。
2. **Spawn 上下文显式化**：`SubagentSpawnContext` 把父状态拍平成可传递 bag，避免环状依赖。
3. **子会话同构、深度截断**：实现复用 Session 栈，产品语义上只允许一层委派。
4. **共享 I/O、隔离上下文**：编辑与命令环境一致，token 与对话历史分离。
5. **解析逻辑可测试**：role/persona/resume 落在 `xai-grok-subagent-resolution`。
