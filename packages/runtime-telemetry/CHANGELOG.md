# Changelog

## [Unreleased]
### Changed

- **品牌更名 Astravia**：全库由 Vetta 更名为 Astravia（`@vetta/*` → `@astravia/*`；应用名、窗口标题、协议、数据目录与 UI 文案同步更新）。

### Added

- 新增平台无关 `RuntimeTracer` / `RuntimeObservation` tracing 契约，并提供基于 Langfuse JS/TS SDK v5 + OpenTelemetry 的 Langfuse exporter。
- `RuntimeObservationUpdate` 支持 `userId`、`sessionId`、`traceName`、`tags`、`version` 等 trace 归属字段；Langfuse exporter 会通过 attribute propagation 写入，支持 Langfuse Sessions 与 trace 维度聚合。
