# Team: Runtime

> 本包属于 **Runtime Team**，同组包：`runtime-core`、`runtime-storage`、`runtime-telemetry`、`runtime-tools`、`cli-app`

## 职责范围

MCP（Model Context Protocol）管理器的导出包，re-export 自 `@astravia/coding-agent`。

## 注意事项

- 仅 1 个源文件，是 coding-agent MCP 模块的薄包装
- 修改需同步检查 `coding-agent` 的 `core/mcp/` 导出
