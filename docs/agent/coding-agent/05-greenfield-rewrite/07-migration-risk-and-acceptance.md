# 数据迁移、风险与验收

## 1. 数据迁移与回滚

全面重写最大的风险不是 TypeScript API，而是用户数据。

### 1.1 数据版本

所有新持久化记录必须带显式版本：

```ts
interface StoredConversation {
	readonly schemaVersion: 2;
	readonly sessionId: string;
	readonly events: readonly StoredSessionEvent[];
}
```

不根据字段是否存在猜测版本。

### 1.2 迁移策略

推荐：

```text
v1 文件
-> v1 reader
-> 规范化 Conversation Event
-> v2 Repository
```

迁移器必须：

- 可重复执行。
- 不覆盖原文件。
- 在完整验证后原子发布新文件。
- 记录来源版本和迁移结果。
- 对未知记录保留原始载荷并报告，不静默丢弃。

### 1.3 回滚策略

在入口切换前：

- 旧实现仍可启动。
- 新实现只写隔离的测试数据。

入口切换后：

- 保留原 v1 数据。
- 新实现使用 v2 数据。
- 若需要回滚，只回滚程序入口，不反向覆盖 v1。

一旦允许新实现产生旧实现无法理解的新副作用，就不能声称支持无损回滚。此时必须把回滚定义为“恢复旧程序并保留新数据待再次迁移”，而不是伪造双向兼容。

## 2. 风险与控制

| 风险 | 表现 | 控制 |
| --- | --- | --- |
| 新架构复制旧概念 | 新代码仍充满 Manager 和跨层回调 | 先固定端口和依赖守卫 |
| 范围失控 | 同时重写模型、Desktop、扩展系统 | 明确非目标，按 Feature 迁移 |
| 行为遗漏 | 旧代码隐藏大量边缘语义 | 黑盒基线和 External Contract Matrix |
| 数据损坏 | 新存储直接覆盖旧文件 | 只读导入、版本化、原子发布 |
| 双实现长期存在 | Feature Flag 永久保留 | 设置删除门槛，切换后立即清理 |
| 过度抽象 | 为所有能力创建万能 middleware | 使用固定 Contribution 合同 |
| Pipeline 失控 | Feature 可以插入任意 `next()` 或修改共享 context | 固定强类型阶段，不公开通用 Middleware |
| 接口泛滥 | 每个内部类都创建单一实现接口 | 只抽象边界、策略和测试替换点 |
| 热更新污染 Turn | Turn 中途工具或指令变化 | 不可变 Snapshot + Turn 边界切换 |
| 下游反向塑形 | RuntimeHost 继续访问具体类 | 先重写稳定 Host API |

## 3. 分阶段验收门

### Gate A：合同冻结

- 外部调用方盘点完成。
- 数据格式盘点完成。
- breaking change 获得确认。

### Gate B：Kernel 成立

- Fake Model + Fake Tool 闭环通过。
- 状态机、取消、存储和资源释放通过。
- Typed Turn Pipeline 和持久化检查点通过。
- Kernel 不包含业务 Feature。
- Kernel 不公开万能 Middleware。

### Gate C：Feature 完整

- 必需 Feature 全部通过统一合同测试。
- Compiler 确定性和冲突测试通过。
- 不再存在旁路注入通道。

### Gate D：宿主迁移

- CLI、RPC、Desktop、IM 使用稳定 Session API。
- 下层包不再依赖 `coding-agent`。
- 外部合同测试通过。

### Gate E：允许删除

- 旧实现无生产引用。
- 数据迁移已验证。
- 整仓检查和目标测试通过。
- 删除清单经过复核。

任何 Gate 未通过，都不能以“代码大部分已经写完”为由提前删除旧实现。

## 4. 建议的首批实施任务

全面重写正式开始时，第一批任务不应写 MCP、Skill 或知识库，而应是：

1. 建立 External Contract Matrix。
2. 建立 Persistence Format Matrix。
3. 为 `runtime-core` 定义最小 Session、Snapshot、Feature、Typed Pipeline、Tool、Context Strategy 和 Repository 合同。
4. 增加禁止 `runtime-* -> coding-agent` 的依赖守卫。
5. 用 Fake Model 实现最小新 Kernel。
6. 将旧实现接到新 Session 合同的临时 Adapter 上。

这六项完成后，才具备安全并行重建其他 Feature 的条件。

## 5. 实施记录要求

后续每一轮实施应在独立实施日志中追加以下内容，避免重写周期中丢失决策：

```markdown
## YYYY-MM-DD：任务名称

### 目标

### 修改范围

### 明确未修改

### 新增或修改的合同

### 数据兼容影响

### 测试

### 结果

### 未解决问题

### 下一步
```

日志只记录已经实施和验证的事实。架构设想、备选方案和未来计划仍保留在本文档集，不把计划写成完成状态。

## 6. 最终判断

全面重写是可行的，而且比继续在当前 `AgentSession + 多 Manager + 多扩展通道` 上做局部修补更符合目标。

但正确的全面重写应满足三个条件：

1. **保留行为，不保留内部结构。**
2. **先修正依赖方向，再编写新功能。**
3. **新实现通过统一合同后再删除旧实现。**

最终的 `coding-agent` 应很薄：

```text
Coding Profile
+ Agent Feature 清单
+ Runtime 装配
+ CLI / SDK / RPC Adapter
```

真正稳定的核心位于 `runtime-core + agent-core + ai`；Tool、MCP、Skill、知识库等作为独立 Feature 参与快照编译；IM、CLI、RPC、Desktop 只消费 Session API。只有形成这一依赖方向，全面重写才会得到新架构，而不是得到一份更整齐的旧代码。
