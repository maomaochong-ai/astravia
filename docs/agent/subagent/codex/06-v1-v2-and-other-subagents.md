# 6. V1、V2 与其他子 Agent 机制

## 6.1 Feature 状态

`codex-rs/features/src/lib.rs` 当前定义：

| Feature | 配置 key | 阶段 | 默认 |
|---|---|---|---|
| `Feature::Collab` | `multi_agent` | Stable | 开启 |
| `Feature::MultiAgentV2` | `multi_agent_v2` | UnderDevelopment | 关闭 |
| `Feature::SpawnCsv` | `enable_fanout` | UnderDevelopment | 关闭 |

`Collab` 决定是否有多 Agent 工具；`MultiAgentV2` 决定使用哪一代工具面。`codex-rs/tools/src/tool_registry_plan.rs` 在 `collab_tools=true` 时二选一注册 V1/V2 handlers，不会同时向同一模型暴露两套同名 `spawn_agent`。

## 6.2 工具面对比

| 能力 | legacy V1 | MultiAgentV2 |
|---|---|---|
| 创建 | `spawn_agent` | `spawn_agent` |
| 主要标识 | ThreadId + nickname | canonical task path + nickname |
| 初始输入 | `message` 或结构化 `items` | 纯文本 `message` |
| 上下文 fork | `fork_context: bool` | `fork_turns: none/all/N` |
| 发消息 | `send_input` | `send_message`、`followup_task` |
| 中断重定向 | `send_input(interrupt=true)` | `followup_task(interrupt=true)` |
| 等待 | 指定多个 ThreadId，等任一 final | 等本地 mailbox 任意更新 |
| 列表 | 无 | `list_agents` |
| 恢复 | `resume_agent` | 工具面无 resume |
| 关闭 | `close_agent(ThreadId)` | `close_agent(path 或 ThreadId)` |
| 子任务路径 | 内部可能有 metadata，但非主要 API | 强制 `task_name` 与 AgentPath |

## 6.3 V1 的通信模型

V1 `send_input` 直接提交 `Op::UserInput` 或结构化 `UserInput` 给指定 ThreadId。它支持文本、image、local image、skill、mention 等 richer input。

V1 `wait_agent`：

- 接收非空 `targets`；
- 对每个 child 订阅 status watch；
- 如果已有 final status 立即返回；
- 否则用 `FuturesUnordered` 并行等待；
- 到 deadline 返回当前已完成集合；
- `Completed` status 内可直接包含 final message。

V1 的 child completion watcher 监听 status 并把 `<subagent_notification>` 注入父线程历史。它兼容没有 canonical path 的旧 thread。

## 6.4 V2 的改进方向

V2 将协作从“ThreadId RPC”升级为“命名任务树 + mailbox”：

- task path 比 UUID 更适合模型引用；
- 相对路径天然表达父子作用域；
- `send_message` 与 `followup_task` 分离通知和任务；
- mailbox 使中间消息、完成通知、等待统一；
- `list_agents` 提供树级状态盘点；
- `fork_turns=N` 控制上下文成本；
- child terminal event 直接在 Session 事件路径回传父节点，不依赖 detached watcher；
- completion 不主动触发父 Agent 新 turn，减少无谓模型调用。

## 6.5 V2 当前未稳定之处

源码将 V2 标为 `UnderDevelopment`，可以观察到若干迁移痕迹：

1. `AgentControl` 中仍同时保留 V1 completion watcher 和 V2 Session-driven completion forwarding。
2. V2 `wait_agent` 工具描述承诺 Agent 更新摘要，但 handler 只返回 generic completed/timeout。
3. protocol/App Server 仍把 V2 send/followup 映射为 `CollabAgentTool::SendInput`，说明外部事件命名尚保留兼容层。
4. V2 不暴露 resume，但底层持久化/恢复代码仍存在。
5. 工具描述说子 Agent 可 spawn 后代，默认 `agent_max_depth=1` 实际会阻止。
6. `InterAgentCommunication.other_recipients` 已建模，但当前工具层没有广播/多播参数。
7. mailbox receiver 旁仍有 `idle_pending_input`，源码有 TODO 表示未来可能合并。
8. `followup_task` 描述承诺 running target 会在当前 turn 完成后启动下一 turn；但 final-answer boundary 后到达的消息会被 defer，而普通 task-finished 路径没有显式重新触发 pending-work scheduler，所有竞态下的自动唤醒语义仍需测试固定。

这些不是主流程失效，而是阅读源码时必须区分“设计方向”“tool description”和“当前 handler 返回值”。

## 6.6 `SubAgentSource` 不等于协作任务树

协议中 `SubAgentSource` 包含：

```text
Review
Compact
ThreadSpawn { ... }
MemoryConsolidation
Other(String)
```

只有 `ThreadSpawn` 对应本文前几章的 AgentControl 任务树。

### Review

入口见：

- `codex-rs/core/src/session/review.rs`
- `codex-rs/core/src/tasks/review.rs`

Review 是主 Session 中的专用 review task，再通过 `run_codex_thread_one_shot()` 启动一段一次性 reviewer 会话。它：

- 使用 review prompt/rubric；
- 禁用 web search 与协作工具；
- approval policy 为 Never；
- 解析 structured review output；
- 将事件选择性转发回父 Session；
- 结束后退出 review mode。

它不是可由 `list_agents` 管理的长期 worker。

### Guardian / auto review

相关实现：

- `codex-rs/core/src/guardian/review.rs`
- `codex-rs/core/src/guardian/review_session.rs`
- `codex-rs/core/src/codex_delegate.rs`

Guardian 子 Agent 用于审批请求的风险判断，有专用 policy prompt 和严格的输入/输出流程。它解决“是否批准某个高风险动作”，不参与普通任务拆解。

### Agent jobs / fan-out

`codex-rs/core/src/tools/handlers/agent_jobs.rs` 使用 `SubAgentSource::Other("agent_job:...")` 执行批量 job。`ToolsConfig` 会识别该 source 并暴露 worker-specific job tools。这是面向批处理/fan-out 的另一套机制，不等同于交互式 AgentPath 树。

### Memory consolidation / compact

这些是内部上下文或记忆维护会话。它们通过 source 标记用于请求 header、analytics 和过滤，但不应被当作普通可调度 worker。

## 6.7 为什么统一使用 SessionSource 标记

虽然几类 subagent 生命周期不同，统一 `SessionSource` 仍有价值：

- API 请求可附加低基数 subagent header；
- analytics 能区分 user/internal/subagent；
- thread list/filter 能按来源筛选；
- 专用会话可按 source 限制工具；
- rollout metadata 保留来源；
- App Server 可显示 nickname/role/path。

因此协议层统一“来源分类”，运行时层再选择不同执行模型，是一种合理的正交设计。
