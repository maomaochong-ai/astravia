# Coding Agent 架构分析

本目录记录 `packages/coding-agent` 的架构现状、主要问题与后续演进建议。

当前结论：`coding-agent` 已从最初的终端编码 Agent 演变为同时承载 SDK、会话、工具、扩展、MCP、插件、知识、IM 与子 Agent 能力的产品内核。现阶段的主要风险不是单个文件过大，而是组合边界不唯一、扩展机制重叠、宿主能力下沉以及内部依赖方向不稳定。

## 文档索引

- [架构现状与问题评估](./01-architecture-assessment.md) — 当前运行链路、量化证据、问题优先级、目标边界与渐进式重构建议。
- [内核与能力边界分析](./02-core-boundary-analysis.md) — 从模型原语出发，定义 Agent、Session、Capability、Adapter、Infrastructure 与 Profile 的边界。
- [“内核 + 能力编排”重构方案](./03-kernel-capability-refactoring-solution.md) — 目标架构、核心合同、能力迁移方式、实施阶段、测试策略与完成标准。
- [grok-build Agent 内部实现分析](./04-grok-build-agent-internals-analysis.md) — 分析 grok-build 的 Agent、Session Actor、Sampler、Chat State、Tool、MCP、Skill 与 Plugin，并提炼完全重构时应借鉴和避免的设计。
- [Coding Agent 全面重写方案](./05-greenfield-rewrite/README.md) — 按范围、目标架构、执行 Pipeline、包布局、实施路线、测试及迁移验收拆分的完整方案。

建议按编号顺序阅读：先确认当前问题，再统一内核定义，用 `grok-build` 的真实实现校验目标边界，最后根据是否选择全面替换决定执行 `03` 的渐进式方案或 `05` 的全面重写方案。

## 使用说明

本文档描述的是当前源码状态，不代表已经批准的重构方案。实施架构调整前，应结合具体需求补充兼容范围、测试基线和分阶段验收标准。
