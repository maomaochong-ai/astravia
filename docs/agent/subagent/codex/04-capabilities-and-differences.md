# 4. 子 Agent 能力与主 Agent 的区别

## 4.1 能力结论

协作型子 Agent 本质上是完整 Codex session，因此通常能做主 Agent 能做的大多数工程工作：

- 读取、搜索、修改当前环境中的文件；
- 执行 shell、apply patch、MCP、动态工具等已启用工具；
- 调用模型并进行多轮推理；
- 运行自己的 turn；
- 向父 Agent、后代或其他运行中的 Agent 发送消息；
- 创建自己的子 Agent（前提是 feature 与深度/配额允许）；
- 维护独立上下文、rollout、状态、token usage；
- 根据 role 采用不同模型、reasoning effort、developer instructions 或其他配置。

它不是“只读 helper”。是否只读由任务提示、角色配置、权限和工具集决定，而不是由 subagent 身份固定决定。

## 4.2 主子 Agent 相同点

| 能力 | 主 Agent | `ThreadSpawn` 子 Agent |
|---|---|---|
| 完整 `CodexThread/Session` | 是 | 是 |
| 模型调用 | 是 | 是 |
| 常规工具执行 | 是 | 通常是 |
| 独立 active turn | 是 | 是 |
| 独立上下文窗口 | 是 | 是 |
| 独立 status/rollout | 是 | 是 |
| 使用共享工作环境 | 是 | 是 |
| 使用 `AgentControl` | 是 | 是，同树共享 |
| 创建后代 Agent | 配置允许时 | 配置允许时 |
| 发送 Agent 消息 | 是 | 是 |

“同一套工具”来自 `ToolsConfig::new()` 和 `build_tool_registry_plan()` 对每个 turn 重新构建工具集合。V2 工具描述也明确告诉模型 spawned agent 拥有相同工具并能够 spawn 后代。

但“通常相同”不是绝对保证：role 配置、provider capability、feature flag、depth 和专用子 Agent 类型都可能缩减工具集合。

## 4.3 关键差异

### 1. 用户入口与父节点

主 Agent 直接承接用户输入，没有 `parent_thread_id`；协作型子 Agent 的 `SessionSource` 固定记录直接父节点、深度和 path。

直接后果：

- 子 Agent terminal turn 会向直接父节点发完成通知；
- root 不会向“父节点”回传；
- `followup_task` 禁止把 root 当作被派发任务的 worker；
- `close_agent` 禁止关闭 root。

### 2. 逻辑路径

root canonical path 为 `/root`。子 Agent path 由父路径和 `task_name` 拼接。路径不仅用于展示，也决定相对寻址和子树关系。

### 3. 初始上下文来源

主 Agent 初始上下文来自用户、全局/项目指令、环境和 session 配置。子 Agent 在此基础上还有一层选择：

- `fork_turns=none`：无父对话历史；
- `fork_turns=all/N`：带经过过滤的父 rollout；
- 初始任务以 inter-agent envelope 到达；
- V2 可注入专门的 `subagent_usage_hint_text`。

### 4. 完成后的行为

主 Agent 完成通常把最终答案交给用户。子 Agent 完成则：

- status 变成 `Completed(final_message)`；
- 将结构化完成通知排入直接父节点 mailbox；
- thread 保持存活，等待 follow-up 或 close。

### 5. 资源层级限制

根 Agent depth 为 0；每层 `ThreadSpawn` 加一。默认最大深度为 1，所以默认只有 root 能成功 spawn。所有后代共享同一树级并发配额。

### 6. API 请求标记

子 Agent 模型请求附带 `x-openai-subagent` header。协作型子 Agent 值为 `collab_spawn`；review、compact、memory consolidation 和其他子 Agent 有各自标签。实现见：

- `codex-rs/codex-api/src/requests/headers.rs`
- `codex-rs/core/src/client.rs`

### 7. 前端可见性

App Server 会在收到 `notify_thread_created()` 后自动为新子 thread 附加 listener，使客户端能看到独立 thread 的流式事件。主 thread 的协作调用又会被映射成 `CollabAgentToolCall` 项，前端既能看到“主 Agent 派发了什么”，也能订阅“子 Agent 正在做什么”。

## 4.4 子 Agent 的工具是否真的完全相同

需要分情况回答。

### `ThreadSpawn` 协作子 Agent

一般从父 turn 的 feature/config/provider capability 重建 `ToolsConfig`，因此工具集合高度相似。可能的差异包括：

- role config 改变 model、developer instructions、feature 或权限；
- 子 Agent 达到 `agent_max_depth` 后，legacy 路径会禁用 `SpawnCsv` 和 `Collab`；
- V2 handler无论深度都可能仍展示 spawn 工具，但实际 spawn 时进行 depth check 并返回错误；
- provider 不支持的工具不会暴露；
- 环境缺失时 environment 工具会变化；
- 管理配置可隐藏 spawn 的模型/角色参数。

### 专用内部子 Agent

review 等内部 subagent 会主动禁用能力。例如 `codex-rs/core/src/tasks/review.rs`：

- 禁用 web search；
- 禁用 `SpawnCsv`；
- 禁用 `Collab`；
- approval policy 固定为 `Never`；
- base instructions 替换为 review rubric。

因此不能把 `SessionSource::SubAgent` 的所有 variant 都理解成“和主 Agent 等权的协作 worker”。

## 4.5 工作区与修改冲突

协作型子 Agent spawn 时继承父 turn 的 `cwd`、environment selections、shell snapshot；源码中没有为每个 `ThreadSpawn` 自动创建独立 Git worktree 或文件系统快照。

所以：

- Agent A 写入文件后，Agent B 通常立即可见；
- 两个 Agent 同时修改同一文件可能覆盖或产生逻辑冲突；
- `AgentRegistry` 只锁任务路径和配额，不锁文件；
- `ThreadManagerState` 只管理 thread，不做代码 merge；
- 主 Agent 必须用任务提示约束互斥写集，并在最终集成时检查 `git diff/status`。

这解释了内置 `worker` role 描述为什么强调明确文件 ownership，以及不要回滚其他 Agent 的工作。

## 4.6 权限与安全边界

子 Agent 不会天然获得比父 Agent 更高的权限。spawn 配置从创建时的父 turn 同步：

- approval policy；
- permission profile；
- sandbox；
- cwd；
- shell environment policy；
- 可兼容时共享 exec policy manager。

role 可以叠加配置，但仍经过 Config layer/requirements 约束。源码设计重点是让子 Agent 与父 Agent 的有效运行时安全策略一致，避免复制陈旧 config 后出现权限漂移。

## 4.7 能力比较总结

主 Agent 与协作型子 Agent 的根本差异不是“聪明程度”或“工具多少”，而是职责和拓扑位置：

```text
主 Agent：用户目标入口 + 全局分解 + 结果集成 + 最终用户输出
子 Agent：独立执行上下文 + 有界子任务 + 向父/同伴发送产出
```

运行时没有强制主 Agent 一定只做协调，也没有强制子 Agent 只做执行。这些职责主要由 developer instructions、tool description 和派发 prompt 塑造。
