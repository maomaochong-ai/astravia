# Team: Runtime

> 本包属于 **Runtime Team**，同组包：`runtime-mcp`、`runtime-storage`、`runtime-telemetry`、`runtime-tools`、`cli-app`

## 职责范围

核心运行时层，定义会话事件模型、数据契约、运行时宿主接口。

## 关键模块

- `src/contracts.ts` — SessionEvent、PromptRequest、SessionFacade 等核心契约
- `src/runtime-host/` — 运行时宿主实现（`runtime-host.ts` 编排 + session-events / history / peripheral-tasks 等）
- `src/errors.ts` — 错误定义

## 注意事项

- 本包是 `desktop-app` 和 `cli-app` 的直接依赖，接口变更影响所有应用层
- `contracts.ts` 中的事件类型是应用层和 coding-agent 之间的通信协议，变更需两端同步
- 本包及同组 runtime-* 包都是薄适配层，代码量很少，通常随 coding-agent 的变更而联动更新
