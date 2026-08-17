# Team: Runtime

> 本包属于 **Runtime Team**，同组包：`runtime-core`、`runtime-mcp`、`runtime-storage`、`runtime-telemetry`、`cli-app`

## 职责范围

工具集导出包，re-export 自 `@astravia/coding-agent` 的各类文件操作工具。

## 注意事项

- 仅 1 个源文件，是 coding-agent 工具模块的薄包装
- 导出 `bashTool`、`readTool`、`editTool`、`grepTool`、`findTool` 等
- coding-agent 新增工具时需同步更新本包的导出
