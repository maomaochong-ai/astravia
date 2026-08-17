# 06 — Goal、Persona/Role、Worktree 与 Resume

除「主模型直接 spawn」外，Grok Build 还用同一套 subagent 基础设施支撑 **Goal 模式**、**Persona/Role 配置层**、**git worktree 隔离** 与 **resume 续跑**。这些机制让主/子协作更贴合「按目标完成任务」。

## 1. Agents vs Personas（产品分层）

官方文档：`crates/codegen/xai-grok-pager/docs/user-guide/16-subagents.md`

| | Agents（`subagent_type`） | Personas |
|---|---|---|
| 配置什么 | 会话本体：模型、工具、system prompt | 行为叠加：语气、输出格式、I/O 合同 |
| 作用范围 | 主会话或子会话 | **仅子会话**（通过 resolution） |
| 定义位置 | `.grok/agents/`、builtin、插件 | `config.toml [subagents.personas]`、`.grok/personas/*.toml` |
| 模型如何指定 | `spawn_subagent.subagent_type` | **模型通常不直接传 persona**；由 role 解析叠加 |

实现上 persona 指令最终进入子对话的 `<system-reminder>` 或 prompt 模板中的 `<persona>` 块。

## 2. Role 与有效覆盖优先级

纯逻辑：`crates/codegen/xai-grok-subagent-resolution/src/overrides.rs`

每个字段大致：

```
spawn 显式 override
  > role 默认（按 subagent_type 或 persona 名查 subagent_roles）
  > persona 默认
  > 父继承 / None
```

可覆盖：`model`、`reasoning_effort`、`capability_mode`、`isolation`、role prompt_file、persona instructions。

错误策略：

- **Persona 指令文件不可读** → fail-closed，中止 spawn  
- **Persona 未找到/空指令** → 非致命 error 字段（依路径）  
- **Role prompt_file 失败** → soft warn，继续  

## 3. Persona I/O 合同

Persona 可声明：

```toml
[[subagents.personas.reviewer.inputs]]
name = "review_file"
io_type = "file"
required = true

[[subagents.personas.reviewer.outputs]]
name = "summary_file"
io_type = "file"
```

用途：

- 目录展示与主模型 description 摘要（`persona_io_summaries`）  
- 引导链式工作流（A 的输出文件作 B 的输入）  

**不是** spawn 时的强制 schema 校验器；文件是否真正写好仍靠模型与后续检查。

## 4. Resume：多阶段流水线

### 4.1 启用条件

1. `resume_from = <completed subagent_id>`  
2. 源不在 active/pending  
3. 源属于当前 parent session（及 cwd 相关校验）  
4. `validate_resume_identity`：type（及 persona）匹配  
5. 源模型 **固定**；调用方 model 参数 soft-ignore  

### 4.2 继承什么

| 继承 | 不继承 / 重算 |
|---|---|
| 原始 transcript | System prompt **按当前 AgentDefinition 重渲染** |
| tool state | 工具配置可按 definition 刷新 |
| model | — |
| worktree（若有） | 可 reuse / rehydrate from snapshot_ref |

新 `prompt` 作为后续 user message 追加——主 Agent 只需描述**增量变更**，无需重讲整个研究背景。

### 4.3 Worktree + Resume

源有 worktree 时：

- 目录仍在 → reuse  
- 目录没了但有 `snapshot_ref` → rehydrate  
- 都没有 → 共享 workspace 警告降级  

新 spawn 若对「无 worktree 的源」强行 `isolation=worktree`，会被忽略。

## 5. Isolation = worktree

### 5.1 创建

`handle_request` 使用 `xai_fast_worktree::WorktreeBuilder`：

- 目标路径：`worktree_base/subagent-{id}`  
- `WorkingTreeMode::PreserveWorkingTree`  
- `WorktreeKind::Subagent`  
- 失败 → **共享 workspace 降级**（不中止任务）  

### 5.2 运行

- 子 `cwd` 指向 worktree  
- 编辑不污染主工作树  
- 结果带 `worktree_path`  

### 5.3 结束

若开启 snapshot 特性（`GROK_SUBAGENT_WORKTREE_SNAPSHOT` / features / remote settings，默认 false）：

1. `refs/grok/subagents/{id}` 快照  
2. 成功持久化 meta 后删除 worktree 目录  
3. resume 可从 ref rehydrate  

未开启时 worktree **保留供人审查**。

产品层还提到 `x.ai/git/worktree/*` 扩展与 apply merge 回主树（TUI/workspace 扩展路径）。

### 5.4 与 `cwd` 互斥

两者都设定「有效工作目录」：

- 同时指定且 cwd 是真实目录 → 参数错误  
- cwd 乱路径 + worktree → 清掉 cwd，worktree 胜  

## 6. Goal 模式与 Subagent

### 6.1 共用基础设施

Goal 循环（`/goal`、`update_goal`）在 shell session 层实现，其 planner / classifier / summarizer / skeptic 等会通过 **同一 coordinator** spawn 子会话。

差异：

| | 模型 spawn | Goal harness spawn |
|---|---|---|
| `surface_completion` | true | 常 false（模型不可见） |
| `harness_agent_type` | None | 可强制某 harness 工具集/prompt |
| `fork_context` | 否 | 可能 |
| auto-wake | 可能 | goal_loop_active 时全局抑制 |

### 6.2 Goal loop 对协作通道的影响

`goal_loop_active: Arc<AtomicBool>` 共享到：

- 子 spawn context  
- 父工具 Resources（`GoalLoopActive`）  

效果：

1. 后台完成 **不 auto-wake**  
2. TaskCompletionReminder **不 surface** 完成文案（仍标记已报，防重复）  
3. 保护 goal 状态机不被异步 completion turn 打断  

Goal 自己通过 `update_goal` / classifier 路径推进「是否达成目标」，而不是依赖通用 auto-wake。

### 6.3 与「按目标完成任务」的关系

| 层次 | 机制 |
|---|---|
| 用户目标 | Goal tracker + 模型 `update_goal` |
| 任务分解 | 主模型 spawn 多个 typed subagent |
| 验收 | Goal classifier / skeptic subagent（harness） |
| 实现隔离 | worktree subagent |
| 多阶段上下文 | resume_from |
| 空闲推进 | auto-wake（非 goal 时） |

即：**Goal 管「是否完成」；Subagent 管「并行执行切片」**；两者交汇在同一 Session 与 Coordinator。

## 7. Fork context（Harness）

`SubagentRequest.fork_context`：

- 不在公开 TaskTool schema  
- 把父对话规范化后作为子前缀  
- 强制使用父 model（覆盖 pins）  

用于需要「看见父在聊什么」的内部角色，而非普通模型委派（普通委派应把要点写进 prompt）。

## 8. 自定义 Role 示例（配置语义）

```toml
[subagents.roles.researcher]
description = "Deep research agent"
default_capability_mode = "read-only"
model = "grok-build"
prompt_file = ".grok/prompts/researcher.md"
```

与 `subagent_type=researcher` 或 persona 键匹配时，resolution 叠上默认 capability 与 prompt。

## 9. 推荐组合模式

### 模式 A：探索 → 实现

1. `explore` background 并行多个区域  
2. 主会话汇总  
3. `general-purpose` + `isolation=worktree` 实现  
4. 主会话审查 worktree / apply  

### 模式 B：resume 流水线

1. `explore` 深挖，完成拿 id  
2. `general-purpose` + `resume_from=id` 直接实现（保留研究 transcript）  

### 模式 C：Goal 驱动

1. 用户 `/goal`  
2. 主循环实现；必要时 spawn 子任务  
3. harness classifier 判定 Achieved  
4. 期间 auto-wake 关闭，避免乱入  

### 模式 D：Persona 审查

1. 定义 reviewer persona（I/O 合同）  
2. 通过 role 解析挂到某 subagent_type  
3. 主 Agent 在 prompt 中传入待审文件路径  

## 10. 相关源码索引

| 主题 | 路径 |
|---|---|
| Override 优先级 | `xai-grok-subagent-resolution/src/overrides.rs` |
| Resume 校验 | `.../resume.rs` |
| Worktree 创建/snapshot | `xai-grok-shell/src/agent/subagent/handle_request.rs` + `session/worktree` |
| Auto-wake / goal 门闩 | `subagent/mod.rs` `should_auto_wake_subagent` |
| Goal e2e | `xai-grok-shell/src/session/acp_session_tests/goal/` |
| 用户文档 | `xai-grok-pager/docs/user-guide/16-subagents.md` |
