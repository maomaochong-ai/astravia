# Team: Runtime

> 本包属于 **Runtime Team**，同组包：`runtime-core`、`runtime-mcp`、`runtime-telemetry`、`runtime-tools`、`cli-app`

## 职责范围

存储管理导出包，包括认证存储、会话管理、设置管理，re-export 自 `@astravia/coding-agent`。

## 注意事项

- 仅 1 个源文件，是 coding-agent 存储模块的薄包装
- 导出 `AuthStorage`、`SessionManager`、`SettingsManager` 等
