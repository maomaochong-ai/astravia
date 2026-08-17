# 05 — 多子 Agent 管理

## 1. 管理模型：扁平星型

```
              ┌──────── Parent Session ────────┐
              │  MvpAgent.subagent_coordinator │
              └───────────────┬────────────────┘
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
   Subagent A            Subagent B            Subagent C
   (pending/active)      (active)              (completed)
```

- **无**孙 Agent：`MAX_SUBAGENT_DEPTH = 1`  
- **无**兄弟间注册表路径：只用 `subagent_id`（UUID v7）  
- 所有并发子任务登记在**同一** `SubagentCoordinator`  

## 2. 标识与归属

| 字段 | 用途 |
|---|---|
| `subagent_id` | 全局主键；= child_session_id（MVP） |
| `parent_session_id` | 归属父会话；list/resume 作用域 |
| `parent_prompt_id` | 归属父 turn；按 turn 取消与 usage 报告 |
| `description` | 人类/模型可读短标签 |
| `subagent_type` / `persona` | 类型与行为叠加 |
| `run_in_background` | 是否跨 turn 存活、是否参与 outstanding drain |

Resume 校验：源必须 **completed**、**同 parent_session**、**type（及 persona 规则）匹配**。

## 3. Coordinator 数据结构

```rust
// 概念结构，见 subagent/mod.rs
struct SubagentCoordinator {
    pending: HashMap<String, PendingSubagent>,
    active: HashMap<String, SubagentTracker>,
    completed: HashMap<String, CompletedSubagent>,
    pending_completions: Vec<SubagentCompletionSummary>,
    block_wait_slots: HashMap<String, Vec<BlockWaitSlot>>,
    completion_notify: Arc<Notify>,
    running_gauge: Arc<AtomicUsize>,
    is_turn_active: Arc<AtomicBool>,
    subagent_usage_not_applied_prompts: HashSet<String>,
    ...
}
```

### 并发语义

- 每个 Spawn 在独立 `tokio::task::spawn_local` 中执行 `handle_subagent_request`  
- 多子 Agent **并行 await** 模型流与工具 I/O  
- Coordinator map 在单线程 LocalSet 上用 `RefCell` 串行更新（无跨线程锁）  

### running_gauge

`pending.len() + active.len()` 同步到原子计数，供 `AgentActivity::is_busy` 等：子任务在飞时推迟某些自动关闭/更新行为。

## 4. 并发数量

代码中**没有**类似 Codex 的硬编码全局 subagent 配额常量（至少在当前分析路径未发现 `MAX_SUBAGENTS` 一类限制）。实际并发受：

- 模型是否继续 spawn  
- API 速率与本地资源  
- 用户取消 / kill  
- 配置禁用类型  

产品上依赖模型自律 + 用户配置，而非 registry reservation。

## 5. 多任务等待与轮询

| API | 行为 |
|---|---|
| `get_command_or_subagent_output` + 多 `task_ids` | 最多 20 id；`timeout_ms>0` 等到**全部**完成或超时 |
| Query `block=true` | 单 id 阻塞；默认超时 30s（coordinator 侧 `unwrap_or(30_000)`） |
| Completions drain | 批量取出已完成摘要 |

主模型常见模式：

```
1. 并行 spawn 3 个 background explore → 拿到 3 个 id
2. 自己继续改代码 / 或 wait 多 id
3. auto-wake 或手动 get_output 汇总
```

## 6. 取消与存活策略

| 场景 | 前台子 Agent | 后台子 Agent |
|---|---|---|
| 用户取消当前 prompt turn | 随 `ParentPromptId` 取消 | **保留** |
| 模型 kill 指定 id | 取消 | 取消 |
| 前台 await 超时 auto-background | 标记 `run_in_background`，不再挡 freeze | — |
| 显式 kill | 抑制 auto-wake | 抑制 auto-wake |

`outstanding_for_prompt` **只**统计非 background 的 pending/active，用于 turn 结束 drain；`background_live_for_prompt` 单独标记账单可能 incomplete。

## 7. 完成缓冲与去重

1. 完成时 `move_to_completed`，若 `surface_completion` 则进入 `pending_completions`  
2. Reminder / auto-wake 各自消费  
3. `ReportedTaskCompletions` + `AutoWakeDeliveredIds` 防止同一 id 多次刷屏  
4. `suppress_ids` 在 Completions 请求中跳过已在 tool result 里交付的 id  

## 8. TTL 与 Resume 窗口

`evict_stale_completed`（`coordinator_query.rs`）：

- 完成超过 **30 分钟** 的 completed 条目删除  
- 删除后 `resume_from` 会 not found  
- 磁盘 session 目录可能仍在，但内存 coordinator 不再提供 resume 源  

查询路径上会触发 eviction，避免 completed map 无限涨。

## 9. Token / 账单管理

多子 Agent 时的关键问题：父 prompt 报告如何包含子用量。

机制：

1. 子完成时尝试 **fold** 用量到父  
2. 失败 → `subagent_usage_not_applied` sticky 标记  
3. headless/usage 报告可读 incomplete；background 仍 live 时也标 incomplete  
4. freeze/cancel 时 clear 相应标记  

详见 coordinator lifecycle 与 headless 用户文档（`14-headless-mode.md` 中 subagent usage 段落）。

## 10. 配置层管理

| 配置 | 效果 |
|---|---|
| `GROK_SUBAGENTS=0` / `enabled=false` | 全关 |
| `[subagents.toggle]` | 按类型关 |
| `[subagents.models]` | 按类型钉模型 |
| `allowed_subagent_types` | AgentDefinition 限制可 spawn 集合 |
| `--disallowed-tools Agent` / `Agent(explore)` | CLI 禁用全部或某类型 |
| `--agents JSON` | 注入自定义定义 |
| `--no-subagents` | 会话禁用 |

`ValidateType` 在 spawn 前把 Unknown/Disabled/NotAllowed 变成模型可理解的错误，减少 fire-and-forget 后台失败。

## 11. TUI 管理面

| UI | 操作 |
|---|---|
| Tasks pane `Ctrl+B` | 分组显示 Subagents：状态、耗时、kill/inspect |
| Scrollback 块 | running 活动后缀；Enter 打开子 transcript |
| 全屏 frame | 观察子对话；q/Esc 返回父 |
| `/config-agents` | Agents / Personas 目录管理 |

实现入口：`xai-grok-pager/src/app/subagent.rs`、`scrollback/blocks/subagent.rs` 等。

## 12. 与后台 bash/monitor 的统一命名

模型侧工具名刻意合并：

- `get_command_or_subagent_output`  
- `kill_command_or_subagent`  
- `wait_commands_or_subagents`  

即：**后台 shell 任务与 subagent 共用一套生命周期工具**，降低模型心智负担。内部仍分流：bash 走 TerminalBackend，subagent 走 SubagentEvent。

## 13. 插件与自定义 Agent

- `plugin_registry` 参与 agent 查找  
- 用户 agent 定义可 shadow builtin 名  
- 子 spawn 时 `apply_session_cli_overrides` 应用父会话 `--tools` / permission-mode 等限制  

## 14. 管理要点小结

1. **一个 coordinator 管全树（实际是一层星）**  
2. **id 即 session id**，简单但无昵称系统  
3. **前台/后台分流** 是取消与 outstanding 的核心  
4. **30 分钟 completed TTL** 限制 resume  
5. **无硬编码并发配额**；靠产品配置与模型行为  
6. **TUI + ACP 事件** 提供人类可观测性  

下一篇扩展 goal、persona 与 worktree：[06-goal-personas-isolation.md](06-goal-personas-isolation.md)。
