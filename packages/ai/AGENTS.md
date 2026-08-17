# Team: AI Core

> 本包属于 **AI Core Team**，同组包：`packages/agent`、`packages/tui`、`packages/web-ui`

## 职责范围

统一多提供商 LLM API，包括流式处理、模型管理、提供商注册。

## 关键模块

- `src/stream.ts` — 核心流式处理入口
- `src/types.ts` — 所有类型定义，修改需同步检查 agent/web-ui 的兼容性
- `src/models.generated.ts` — 自动生成，不要手动编辑；通过 `scripts/generate-models.ts` 生成
- `src/providers/` — 各 LLM 提供商实现
- `src/api-registry.ts` — API 注册表

## 注意事项

- 修改 `types.ts` 中的 `Api`、`StreamOptions`、`KnownProvider` 等类型后，必须检查 `packages/agent` 和 `packages/coding-agent` 是否需要适配
- 添加新提供商请严格遵循根目录 AGENTS.md 中的 "Adding a New LLM Provider" 流程
- 测试在 `test/` 目录，运行方式：`bunx tsx ../../node_modules/vitest/dist/cli.js --run test/<file>.test.ts`
