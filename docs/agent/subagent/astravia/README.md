# Astravia Subagent 落地方案

本文档集给出在 Astravia 中内建 subagent 的推荐方案。结论基于：

- Astravia 当前源码：`6984752e9ceb5e5536e4f6006f4555d45eaa91e3`（2026-07-17）；
- Codex 现有分析文档基线：`a4fbd6d909262ebc539f559725944ba9b1ddca04`；
- Grok Build 现有分析文档基线：`c68e39f60462f28d9be5e683d9cbe2c57b1a5027`；
- 复核时的 Codex 源码：`315195492c80fdade38e917c18f9584efd599304`；
- 复核时的 Grok Build 源码：`8adf9013a0929e5c7f1d4e849492d2387837a28d`。

已有分析文档与当前参考仓库 HEAD 不是同一提交，因此本文把已有文档用于建立完整心智模型，再用当前源码核对关键契约；不把某个仍在演进的工具返回格式直接当成 Astravia 的兼容目标。

## 结论

Astravia 首版应采用：

> **`coding-agent` 原生、单层星型、独立 `AgentSession`、宿主注入会话工厂、共享工作区、事件驱动回传。**

具体取舍：

1. subagent 是完整、独立的 `AgentSession`，不是在父上下文中替换 system prompt。
2. `SubagentCoordinator` 归 `AgentSession` 所有，放在 `packages/coding-agent`；不把多 Agent 策略下沉到通用的 `packages/agent`。
3. 子会话必须由 `SubagentSessionFactory` 创建。desktop 的 `RuntimeHost` 注入保留 sandbox/执行模式的工厂，CLI/SDK 使用默认本地工厂；禁止直接复用父会话的工具闭包。
4. 首版只允许 root 创建一层 child，child 不暴露 subagent 工具；默认最多 3 个同时处于 `pending/running` 的 child。
5. 首版**只注册 `explorer`**（只读探索 + 父 MCP 代理；改写归主 Agent）。类型系统用 `SubagentTypeRegistry` 横向扩展（后续 `worker` 等只注册定义，不改 coordinator）。继承父会话当前模型与推理强度，不开放模型覆盖、自定义角色和上下文 fork。
6. 首版工具面为 `spawn_agent`、`send_message`、`followup_task`、`wait_agent`、`list_agents`、`interrupt_agent`。
7. 完成结果通过同步 wait 或合并后的 `<subagent_notification>` 回到父 Agent；同一完成结果只由一个通道消费，避免重复唤醒。
8. 子 transcript 独立落盘，进程重启后运行中的 child 标记为 `interrupted`，不自动续跑；已完成 child 可由 `followup_task` 懒加载并续接。
9. 首版共享 cwd，不做自动 worktree。工具描述和运行时校验要求并行写任务具有互斥写集。
10. feature fail-closed：底层 SDK 默认关闭，CLI 与 desktop 的普通 `conversation/project` 场景显式开启；`batch`、`automation`、`kb-processing`、`im-claw` 首版关闭。

## 为什么不是直接复制 Codex 或 Grok

Codex 的任务树、逻辑路径和 mailbox 很适合可递归、跨兄弟协作，但会一次引入路径注册表、多层恢复、消息边界注入和级联关闭。Astravia 当前没有这些基础，首版没有足够需求证明这份复杂度。

Grok 的单层 coordinator、独立 Session、能力过滤和多路完成交付更贴近 Astravia 当前架构。不过 Astravia 不能照搬 Grok 的本地共享资源方式：desktop 的 sandbox 工具由 `RuntimeHost` 构造，子会话若绕过宿主重新创建普通 bash/edit 工具，会发生权限提升。因此必须增加“宿主注入子会话工厂”这一层。

## 文档导航

1. [01-current-state-and-decisions.md](01-current-state-and-decisions.md)：Astravia 现状、可复用能力、缺口与关键决策。
2. [02-target-architecture.md](02-target-architecture.md)：目标模块、类型、工具、生命周期、权限、持久化和事件设计。
3. [03-implementation-roadmap.md](03-implementation-roadmap.md)：按阶段的文件级实施顺序和明确不做项。
4. [04-testing-and-acceptance.md](04-testing-and-acceptance.md)：测试矩阵、故障场景和验收标准。

## MVP 成功标准

在普通 CLI 或 desktop 项目会话中，主 Agent 能同时启动多个独立 child；每个 child 有独立上下文和 transcript，能按 `explorer/worker` 权限完成任务；主 Agent 能查询、等待、续派和中断；完成通知不会重复唤醒；父会话关闭时没有残留 child；desktop sandbox 下 child 无法获得父会话没有的能力；重启后能看到历史 child，未完成工作不会被误报为完成。

