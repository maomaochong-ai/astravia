# 执行 Pipeline 与抽象边界

## 1. 执行模型

新内核采用 Pipeline 思想，但不是把整个 Agent 实现成可以任意插入 `next()` 的通用中间件链。

执行架构分为四个相互独立的部分：

```text
Session State Machine   控制 Session 生命周期、并发、排队和取消
Turn Pipeline           控制一次 Turn 的固定数据处理阶段
Tool Loop               控制模型与 Tool Call / Tool Result 的循环
Feature Compiler        把 Profile 和 Feature 编译成不可变 RuntimeSnapshot
```

其中：

- Session State Machine 是控制面。
- Turn Pipeline 是数据面。
- Tool Loop 是 Pipeline 中 Execution 阶段的循环执行器。
- Feature Compiler 是配置面，不参与当前 Turn 的动态调度。

## 2. Typed Turn Pipeline

一次 Turn 的固定阶段为：

```text
Admission
-> Snapshot Binding
-> Conversation Loading
-> Context Assembly
-> Context Preparation
-> Execution
-> Finalization
```

各阶段职责：

1. **Admission**
   - 校验 Session 状态。
   - 规范化输入。
   - 分配 `turnId`。
   - 决定排队、拒绝或 steering。
2. **Snapshot Binding**
   - 绑定当前有效 `RuntimeSnapshot`。
   - 一个 Turn 结束前不能切换快照。
3. **Conversation Loading**
   - 从 `ConversationRepository` 加载所需事件和 Snapshot。
   - 不向后续阶段暴露文件路径或数据库连接。
4. **Context Assembly**
   - 合并会话历史、Feature 提供的上下文和产品 instructions。
   - 生成结构化候选上下文，不直接截断消息。
5. **Context Preparation**
   - 计算 Token 预算。
   - 选择保留、裁剪或压缩策略。
   - 产出本 Turn 的最终模型上下文和可持久化的压缩记录。
6. **Execution**
   - 调用 `TurnEnginePort`。
   - 在内部执行模型与 Tool 的循环。
   - 传播取消信号。
   - 按协议记录模型、Tool Call、Tool Result 和停止原因。
7. **Finalization**
   - 持久化终止事件和 Session 元数据。
   - 释放 Turn 级资源。
   - 将 Session 恢复为 Idle 或推进到 Closing。

Tool Loop 不是线性 Pipeline：

```mermaid
flowchart TD
    Model["调用模型"] --> Decision{"产生 Tool Call？"}
    Decision -->|否| Finish["返回停止结果"]
    Decision -->|是| Policy["Tool Policy"]
    Policy --> Execute["Tool Runtime"]
    Execute --> Result["记录 Tool Result"]
    Result --> Model
```

因此不能把 Tool Loop 拆成一串只能执行一次的普通 Stage，也不能让外部 Feature 接管循环控制权。

Pipeline 的每个阶段接收明确输入并返回明确输出。输出在语义上只读，不携带可由任意模块写入的共享 `metadata`：

```ts
export interface PreparedTurn {
	readonly turnId: string;
	readonly snapshot: RuntimeSnapshot;
	readonly messages: readonly ConversationMessage[];
	readonly compaction?: CompactionRecord;
}
```

这里的只读是合同约束，不要求为了形式上的不可变在每个阶段深拷贝全部消息。

## 3. 禁止万能 Middleware

不提供以下公开扩展方式：

```ts
pipeline.use(async (context, next) => {
	await next();
});
```

原因是通用 Middleware 会重新引入：

- 执行顺序依赖注册顺序。
- `next()` 前后均可产生不可追踪的副作用。
- 任意模块修改 messages、tools、instructions 和停止结果。
- 取消和错误传播无法局部推理。
- Feature 之间通过共享 context 形成隐藏依赖。
- 当前 Turn 被运行期配置变化污染。

确实需要扩展的行为必须进入明确合同：

- 新上下文来源使用 `ContextProvider`。
- 上下文预算和压缩使用 `ContextStrategy`。
- 模型可调用行为使用 `ToolDefinition`。
- 工具权限使用 `ToolPolicy`。
- Turn 完成后的非关键处理使用 `TurnObserver`。
- 输入输出协议使用 Adapter。

`TurnObserver` 只能观察已经发生的标准事件，不能修改 Turn 结果。Observer 失败必须被隔离和记录，不能破坏 Session 状态机。

## 4. 抽象原则：抽象边界，不抽象所有实现

内核只依赖稳定 Port，不与文件存储、具体压缩算法、某个模型供应商或 MCP SDK 绑定。但这不意味着每个类、函数和单一实现都需要创建接口。

满足以下任一条件时才建立抽象：

- 存在多个合理实现。
- 属于进程、存储、模型、工具或宿主服务边界。
- 测试需要确定性替换。
- 会随运行环境或产品策略变化。
- 具体实现不应被上层感知。

以下内容应形成稳定 Port：

| Port | 默认实现示例 | 测试实现示例 |
| --- | --- | --- |
| `TurnEnginePort` | `AgentCoreTurnEngine` | `FakeTurnEngine` |
| `ConversationRepository` | `FileConversationRepository` | `InMemoryConversationRepository` |
| `ContextStrategy` | `SummaryContextStrategy` | `NoCompactionContextStrategy` |
| `ContextSummarizer` | `ModelContextSummarizer` | `FakeContextSummarizer` |
| `ToolPolicy` | `DefaultToolPolicy` | `AllowAllToolPolicy` |
| `EventSink` | `MultiplexEventSink` | `CollectingEventSink` |
| Host Capability Client | `AuthorizedCapabilityClient` | `FakeCapabilityClient` |

以下内容通常保持具体实现，不为了形式创建接口：

- Session 状态转换函数。
- Pipeline 内部的固定阶段编排器。
- 只在一个包中使用的输入规范化函数。
- Token 预算中的简单计算器。
- 事件序列化辅助函数。
- 没有替换需求的不可变值对象。

Composition Root 是唯一选择具体实现的位置：

```ts
const repository = new FileConversationRepository(...);
const contextStrategy = new SummaryContextStrategy(...);
const turnEngine = new AgentCoreTurnEngine(...);

const agent = createCodingAgent({
	repository,
	contextStrategy,
	turnEngine,
});
```

Kernel 只能看到 Port，不知道实际绑定的是文件、SQLite、远程服务、摘要压缩或 Fake 实现。

## 5. 上下文压缩边界

上下文压缩属于 `Context Preparation` 阶段的策略，不是 Session Manager 的附属方法，也不是能够直接改写会话历史的 Extension Hook。

建议合同：

```ts
export interface ContextStrategy {
	prepare(
		input: ContextPreparationInput,
		signal: AbortSignal,
	): Promise<PreparedContext>;
}

export interface ContextPreparationInput {
	readonly messages: readonly ConversationMessage[];
	readonly tokenBudget: number;
	readonly reservedOutputTokens: number;
	readonly model: ModelDescriptor;
}

export interface PreparedContext {
	readonly messages: readonly ConversationMessage[];
	readonly estimatedTokens: number;
	readonly compaction?: CompactionRecord;
}
```

实现可以包括：

- `NoCompactionContextStrategy`。
- `SlidingWindowContextStrategy`。
- `SummaryContextStrategy`。
- `HybridContextStrategy`。

如果摘要需要调用模型，再通过最小 Port 隔离：

```ts
export interface ContextSummarizer {
	summarize(
		input: SummarizationInput,
		signal: AbortSignal,
	): Promise<Summary>;
}
```

边界约束：

- `ContextStrategy` 不持有可变 Session。
- 不直接读写 `ConversationRepository`。
- 不读取全局 `ModelRegistry`。
- 不决定压缩记录是否落盘。
- 压缩结果由 Turn Pipeline 作为标准事件持久化。
- Profile 同一时间只能选择一个主 `ContextStrategy`，不能由多个 Feature 依次任意改写上下文。

纯 Token 预算和消息选择可以作为 `ContextStrategy` 内部具体函数，不需要再为每个计算步骤创建公开接口。

## 6. 会话存储边界

Session 不依赖 `FileSessionManager`、JSONL 路径或数据库连接，而依赖具有会话领域语义的 Repository：

```ts
export interface ConversationRepository {
	create(input: CreateConversationInput): Promise<ConversationMetadata>;
	load(sessionId: string): Promise<StoredConversation>;
	append(
		sessionId: string,
		events: readonly StoredSessionEvent[],
	): Promise<AppendResult>;
	saveSnapshot(
		sessionId: string,
		snapshot: ConversationSnapshot,
	): Promise<void>;
	close(): Promise<void>;
}
```

实现可以包括：

- `InMemoryConversationRepository`。
- `FileConversationRepository`。
- `SqliteConversationRepository`。
- `RemoteConversationRepository`。

不应将它抽象成通用 `get(key)` / `set(key, value)`，因为会话存储必须保留：

- 原子追加。
- 事件顺序。
- 乐观并发版本。
- Session 分支。
- Snapshot。
- 未完成 Turn 恢复。
- Schema 迁移。

Pipeline 不假设整个 Turn 是一个长数据库事务。它使用明确的持久化检查点：

1. Turn 接受后，原子写入输入、绑定的 Snapshot ID 和 Turn Started。
2. 模型与工具循环中的标准事件按顺序追加。
3. Finalization 写入完成、失败或取消终止事件。

这样进程中断后可以根据事件日志判断 Turn 停止在哪个阶段，而不是依赖内存状态猜测。
