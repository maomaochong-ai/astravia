# 包布局与公开 API

## 1. 新目录布局

最终布局建议如下：

```text
packages/runtime-core/src/
  session/
    agent-session.ts
    session-state.ts
    input-queue.ts
  turn/
    turn-pipeline.ts
    turn-context.ts
    turn-runner.ts
    turn-engine-port.ts
  features/
    contracts.ts
    compiler.ts
    lifecycle.ts
  context/
    context-builder.ts
    context-strategy.ts
  tools/
    contracts.ts
    tool-runtime.ts
    tool-policy.ts
  storage/
    conversation-repository.ts
  events/
    session-events.ts
  index.ts

packages/runtime-storage/src/
  conversation/
    file-conversation-repository.ts
    event-codec.ts
    snapshot-codec.ts
    v1-importer.ts
  auth/
  settings/
  index.ts

packages/runtime-tools/src/
  read/
  write/
  edit/
  search/
  process/
  coding-tools-feature.ts
  index.ts

packages/runtime-mcp/src/
  client/
  config/
  oauth/
  mcp-tool-adapter.ts
  mcp-feature.ts
  index.ts

packages/coding-agent/src/
  profile/
    coding-profile.ts
    coding-instructions.ts
    default-features.ts
  adapters/
    sdk.ts
    rpc.ts
    cli.ts
  create-coding-agent.ts
  index.ts
```

入口文件只做导出和装配。解析、状态、存储、工具和协议实现必须位于其职责目录。

## 2. 公开 API 收缩

新 `@astravia/coding-agent` 根入口建议只导出：

```ts
export {
	createCodingAgent,
	type CodingAgent,
	type CodingAgentOptions,
	type CodingAgentSession,
	type SessionEvent,
	type SessionInput,
	type TurnResult,
} from "...";
```

可选的明确子入口：

```text
@astravia/coding-agent/cli
@astravia/coding-agent/rpc
@astravia/coding-agent/testing
```

不再从根入口导出：

- `SessionManager`。
- `SettingsManager`。
- `ModelRegistry`。
- `McpManager`。
- Tool 工厂。
- Extension Runner。
- Resource Loader。
- Knowledge 内部函数。

真正需要复用的实现必须移动到其所有权包并从该包导出。不能为了方便再次从 `coding-agent` 聚合导出。
