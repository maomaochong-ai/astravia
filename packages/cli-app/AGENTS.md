# Team: Runtime

> 本包属于 **Runtime Team**，同组包：`runtime-core`、`runtime-mcp`、`runtime-storage`、`runtime-telemetry`、`runtime-tools`

## 职责范围

CLI 应用包装器，提供 `astravia-cli-app` 命令行入口。

## 关键模块

- `src/cli.ts` — CLI 入口点（带 shebang）
- `src/index.ts` — 导出 `runCli` 函数

## 注意事项

- 仅 2 个源文件，调用 `@astravia/coding-agent` 的主函数
- 依赖 `@astravia/runtime-core`
