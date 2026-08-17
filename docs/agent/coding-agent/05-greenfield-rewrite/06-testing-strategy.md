# 测试策略与架构守卫

## 1. Kernel 状态机测试

至少覆盖：

- Idle 时 send。
- Running 时重复 send。
- Tool 执行中 cancel。
- 模型流中 cancel。
- close 与 send 竞争。
- close 与 cancel 竞争。
- Tool 已产生副作用后的停止记录。
- Repository 写入失败。
- observer 失败不能破坏主状态机。

推荐对输入命令序列做 property-based test，验证：

- 永远不出现两个活动 Turn。
- Closed 后不再接受输入。
- 每个开始事件最终对应完成、失败或取消。
- 每个成功 prepare 的资源最终 dispose 一次。

## 2. Turn Pipeline 测试

- 固定阶段严格按协议执行。
- Snapshot 在 Turn 开始时绑定且中途不变。
- Context Strategy 只接收结构化输入。
- 压缩记录由 Pipeline 持久化，而不是由 Strategy 自行写入。
- Tool Loop 只存在于 Execution 阶段。
- Admission 失败时不调用模型。
- Conversation Loading 失败时不进入上下文准备。
- Tool Loop 失败时仍写入标准终止事件。
- cancel 可以传播到 Context Strategy、模型和 Tool。
- observer 失败不改变 Turn 结果。
- 进程在每个持久化检查点中断后均可恢复到可判定状态。

## 3. Compiler 测试

- 相同输入得到相同快照。
- 依赖排序稳定。
- 缺少依赖时报错。
- 循环依赖时报错。
- Tool 重名时报错。
- Feature 冲突时报错。
- prepare 中途失败时释放已创建资源。
- 新快照失败时旧快照继续可用。
- 当前 Turn 不受热更新影响。

## 4. Feature 合同测试

为所有 Feature 运行统一测试套件：

```text
definition
-> prepare
-> contribute
-> execute / observe
-> cancel
-> dispose
```

单独 Feature 不能依赖完整 Desktop 才能测试。

## 5. 上下文策略测试

- 无需压缩时保持消息语义和顺序。
- Token 预算不足时返回确定结果。
- Summary、Sliding Window 和 Hybrid 实现运行相同合同测试。
- Strategy 不修改输入 messages。
- Strategy 不访问 Repository。
- Summarizer 失败时执行显式回退策略。
- cancel 能停止摘要模型调用。
- Compaction Record 可以独立序列化和恢复。

## 6. 存储测试

- 旧会话只读导入。
- 新会话追加和恢复。
- 部分写入恢复。
- 分支与快照。
- schema version 升级。
- 重复迁移幂等。
- Windows 路径和锁。
- 未完成 Turn 的恢复语义。

建议采用：

> 旧格式只读 + 新格式单写。

不要长期双写两种格式。双写会让故障恢复和回滚语义变得不可判定。

## 7. Adapter 测试

- SDK 输入输出合同。
- RPC 协议 fixture。
- CLI 参数映射。
- Desktop RuntimeHost 不读取具体实现属性。
- IM 重试不会重复提交同一个 Turn。
- 断线重连只恢复事件订阅，不重放副作用。

## 8. 架构守卫

增加自动检查：

- `runtime-*` 禁止导入 `coding-agent`。
- `agent-core` 禁止导入 runtime 和产品包。
- `coding-agent` 根入口禁止导出 Manager / Registry。
- Feature 禁止导入具体 Adapter。
- Tool 实现禁止直接访问全局 Session。
- `RuntimeSnapshot` 贡献不能在发布后修改。
- 禁止公开通用 `pipeline.use()`、`next()` 或可写共享 metadata。
- `ContextStrategy` 禁止导入具体 Repository 实现。
- `ConversationRepository` 接口禁止暴露文件路径或数据库连接。
- 除 Composition Root 外，业务包禁止直接构造 Port 的生产实现。

## 9. 验证命令

每轮代码修改：

```text
bun run check:quick
```

针对包运行指定测试：

```text
cd packages/runtime-core
bunx vitest --run test/<specific>.test.ts
```

完成一轮代码改动后：

```text
bun run check
```

根据仓库规则，不使用 `bun test`，也不以文档更新触发无关的整仓检查。
