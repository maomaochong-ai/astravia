# Team: AI Core

> 本包属于 **AI Core Team**，同组包：`packages/ai`、`packages/tui`、`packages/web-ui`

## 职责范围

通用 Agent 运行时，提供 agent 循环引擎、状态管理、传输抽象。

## 关键模块

- `src/agent.ts` — Agent 核心逻辑
- `src/agent-loop.ts` — Agent 循环引擎（核心调度）
- `src/types.ts` — 类型定义
- `src/proxy.ts` — 代理模块

## 注意事项

- 本包是 `coding-agent` 的直接上游依赖，接口变更会直接影响下游
- `agent-loop.ts` 是最关键的文件，修改需格外谨慎
- 测试在 `test/` 目录
