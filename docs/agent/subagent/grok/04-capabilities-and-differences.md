# 04 — 子 Agent 能力与主/子差异

## 1. 子 Agent 本质上是什么

子 Agent = **完整子 Session**（独立对话、独立 turn 循环、独立工具执行），在：

- `AgentDefinition`（类型决定 system prompt 与默认 toolset）  
- 可选 `capability_mode` 过滤  
- `parent_depth + 1` 导致 **禁止再 spawn**  
- 共享父 I/O 资源  

约束下运行。

不是：

- 主对话里的一次普通函数调用  
- 共享同一 context window 的「换人设」  
- 可无限递归的 agent 树（深度硬封顶 1）

## 2. 内置 `subagent_type`

源：`crates/common/xai-tool-types/src/task.rs` + `xai-grok-agent/src/config.rs`

| 类型 | 定位 | 默认工具能力（产品语义） | Prompt 要点 |
|---|---|---|---|
| `general-purpose` | 通用多步任务 | 读/写/搜/执行/web/plan 等全套（随 toolset） | 直接完成任务，详写结果；少建无文件 |
| `explore` | 快速只读探查 | 读、list、search（及配置允许的只读 shell） | **无编辑工具**；并行工具；返回绝对路径 |
| `plan` | 架构与实现计划 | 只读探索 + plan 相关；**无 edit** | 权衡、步骤、Critical Files 列表 |

用户/项目可通过 `.grok/agents/` 等增加类型或 **同名 shadow** 内置类型。

### 2.1 Capability mode 再过滤

即便 general-purpose 工具集完整，spawn 时仍可传：

| Mode | Read | Write | Execute | 说明 |
|---|---|---|---|---|
| `read-only` | ✓ | ✗ | ✗ | 可读、搜、LSP、web、memory… |
| `read-write` | ✓ | ✓ | ✗ | 可改文件，无 shell |
| `execute` | ✓ | ✗ | ✓ | 可 shell，无文件写 |
| `all` | ✓ | ✓ | ✓ | 不过滤 kind |

实现：`SubagentCapabilityModeExt::filter_tool_config`（`task/types.rs`）。无 `kind` 的 MCP/自定义工具默认保留。

过滤后若无可起后台任务的工具，会 prune `get_task_output` / `kill_task`。

## 3. 子 Agent 能做什么（能力清单）

| 能力 | 通常是否可用 | 说明 |
|---|---|---|
| 读文件 / 列目录 / 搜索 | 是 | explore/plan/general-purpose 核心 |
| 编辑/写文件 | 视类型与 mode | explore/plan 默认否 |
| 跑 shell / 测试 | 视类型与 mode | explore 文档要求仅只读命令 |
| Web search / fetch | 继承父配置 | 可被 `--disable-web-search` 等关掉 |
| MCP 工具 | 可继承父 pool | spawn 时 snapshot；之后父侧动态 MCP 不一定可见 |
| Skills | 可继承 | `parent_skills` / skills config |
| Memory search/get | 若启用 | 共享 memory 配置 |
| 后台 bash / monitor | 若工具集含 execute | 退出时 reparent 到父 |
| 图像/视频生成 | general-purpose + mode 允许时 | 继承父 image/video config |
| Plan mode 进出 | 工具集含 enter/exit plan 时 | capability 白名单含相关 kind |
| `ask_user_question` | 继承父开关 | 子会话也可提问（产品上少用） |
| **再 spawn 子 Agent** | **否** | depth 门禁 + 剥离 Task 工具 |
| 与用户多轮闲聊 | 弱 | 自治 worker；TUI 观察为主 |
| resume 续聊 | 是 | 同 type、源已完成、同父会话 |

## 4. 主 Agent vs 子 Agent

| 维度 | 主 Agent | 子 Agent |
|---|---|---|
| Session | 用户会话根 | 隐藏/附属 child session |
| Context | 用户长对话 + 工具结果 | 独立窗口；默认不含完整父历史（除非 fork/resume） |
| System prompt | 主 harness（如 grok-build / orchestrator） | `subagent_prompt.md` + 类型 body + role/persona |
| 工具集 | 会话完整 toolset | 类型 toolset ∩ capability ∩ depth |
| 深度 | 0 | 1 |
| 派发 | 可 spawn | 不可再 spawn |
| 用户交互 | 完整 TUI 输入 | 观察为主；完成回父 |
| 取消与 turn | 用户取消可杀其前台子 | 可被父 kill；后台可跨 turn 存活 |
| Token 账单 | 汇总含子用量（fold） | 自身 session 记账再 fold 回父 |
| 配置中心 | 全量 config | 继承父 + 类型/role/persona 覆盖 |
| 目标 | 对用户负责交付 | 对**任务 prompt** 负责交付摘要 |
| Goal 模式 | 可拥有 goal loop | 可被 harness 用于 classifier 等；surface 可关 |

## 5. 上下文继承策略

| 模式 | `InitialContextSource` | 内容 |
|---|---|---|
| 默认新开 | `New` | 系统提示 + 任务 prompt；无父聊天全文 |
| Fork | `Forked` | 父历史规范化前缀 + 任务（harness） |
| Resume | `Resumed` | 源 subagent 原始 transcript + 新任务；系统提示重渲染 |

**重要产品语义**（工具描述与官方文档强调）：

- 子 Agent 只收到 **压缩版** 项目指令（AGENTS.md 等会按 cwd 发现）  
- 关键构建约定、验收标准应写进 `prompt`，不要假设子能看到父刚讨论过的细节（除非 resume/fork）

## 6. 模型与推理

默认继承父会话 **live** 采样配置（含 api key / base_url / model）。

可覆盖来源（高→低，见 architecture）：

1. spawn / persona / goal runtime model  
2. `[subagents.models].{type}`  
3. AgentDefinition.model  
4. 父会话  

`reasoning_effort` 亦可由 role/persona/definition 覆盖。

## 7. 权限与 YOLO

子会话继承父的 permission handle、yolo 策略相关判定；hooks 走父的 client hooks。子 Agent **不是**独立安全沙箱身份——`isolation=worktree` 是工作区隔离，不是权限提升/降权的完整 sandbox 替代。

## 8. 子 Agent system prompt 骨架要点

模板：`crates/codegen/xai-grok-agent/templates/subagent_prompt.md`

- 自称 focused worker，禁止泄露 system prompt  
- 不扩大任务范围  
- 并行工具调用；优先专用 read/edit 工具  
- 有 execute 时保留 background 任务指引  
- project instruction files（AGENTS.md 等）作用域与优先级  
- 可选 memory / role / persona 块  

类型 body（general-purpose / explore / plan）再叠加风格与禁止项。

## 9. 主 Agent 工具描述如何引导委派

`build_task_description` 生成的说明包括：

- 列出可用 agent 类型及工具摘要  
- background 默认与如何用 output 工具取结果  
- resume_from 用法  
- isolation=worktree 说明  
- 「AGENTS.md 以压缩形式给子 Agent，关键规则写进 prompt」  

Orchestrator 主定义还会用自然语言强制：实现与深探应 spawn，主侧协调审查。

## 10. 子 Agent **不能**可靠承担的工作

1. **需要与用户密集澄清的交互式设计** —— 更适合主会话  
2. **依赖父对话隐式上下文却未写进 prompt** —— 会丢信息  
3. **递归分解多层 agent 树** —— depth=1  
4. **跨兄弟直接协商** —— 无 mailbox  
5. **保证语义正确的任务规划** —— 运行时不验证「是否真完成了用户目标」，只跑到模型停轮  

## 11. 小结

| 问题 | 答案 |
|---|---|
| 子 Agent 能做什么？ | 在其 toolset 与 capability 内的完整 agent 循环：探索/实现/计划/跑命令等 |
| 与主 Agent 最大区别？ | 独立上下文 + 任务导向 + 深度 1 + 结果摘要回传；主 Agent 对用户负责 |
| 如何限制？ | type 默认工具、capability_mode、toggle、disallowed-tools、worktree、depth |
