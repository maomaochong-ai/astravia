# Astravia Desktop UI 验证

本文说明 Agent 如何通过仓库内的 Playwright CLI 入口验证开发版 Astravia Desktop 的真实 Renderer UI。

仓库入口负责启动隔离的验证实例、发现动态 CDP 端口、维护 Playwright session，并自动选择 `Astravia Desktop` 主窗口。不要在提示词或脚本中写死端口、session 名、tab 下标或 snapshot ref。

Astravia Debug 的会话操作参数见 [Astravia Debug](./astravia-debug.md)。

## 标准流程

所有命令都在仓库根目录执行。

将当前工作树的验证实例作为后台长任务启动：

```powershell
bun run verify:ui:start
```

检查实例和 CDP target：

```powershell
bun run verify:ui:status
```

开始 UI 操作前，状态必须同时满足：

- `running === true`
- `ui.configured === true`
- `ui.reachable === true`
- `ui.targetFound === true`

执行 Playwright CLI 命令：

```powershell
bun run verify:ui:pw -- snapshot
bun run verify:ui:pw -- click "getByRole('button', { name: '按钮名称' })"
bun run verify:ui:pw -- screenshot --filename=astravia-ui.png
bun run verify:ui:pw -- console error
```

`verify:ui:pw` 会在需要时自动附着并选择主窗口。需要单独建立或解除 Playwright 附着时使用：

```powershell
bun run verify:ui:attach
bun run verify:ui:detach
```

完成验证后停止当前工作树的验证实例：

```powershell
bun run verify:ui:detach
bun run verify:ui:stop
```

不要直接调用全局 `playwright-cli`，也不要使用 `close`、`close-all` 或 `kill-all`。

## 验证闭环

1. 修改代码后运行 `bun run check`（Biome + 类型 + 架构守卫）。逻辑变更再跑 `bun run test:pkg <包名>` 或 `bun run test:changed`。门禁分层见 [quality-gates.md](./quality-gates.md)。
2. Renderer 改动由 Vite HMR 更新；Main 或 Preload 改动需要执行 `verify:ui:stop` 后重新 `verify:ui:start`。
3. 用 `snapshot` 读取当前页面状态，再执行点击或输入。
4. 等待具体业务状态出现或消失，不使用固定长时间 sleep。
5. 同时验证目标内容、路由或弹层状态，避免只断言“点击成功”。
6. 用 `console error` 检查本次操作引入的错误，并按需保存 screenshot 或 snapshot。
7. 验证失败时根据页面证据继续修改，再重复以上步骤。

需要通过 Astravia Debug 创建或继续真实 Agent 会话时，统一经仓库入口调用：

```powershell
bun run verify:ui:debug -- <Debug CLI 参数>
```

Debug 返回值用于验证业务执行结果，Playwright 用于验证结果是否正确呈现在 UI 中，两者不能互相替代。

## 定位和断言规则

- 优先使用可访问角色、可访问名称和明确的容器范围。
- 元素名称应来自操作前的 snapshot，并与当前界面语言一致。
- 页面存在同名元素时，先限定 `navigation`、`dialog`、`aside` 等容器。
- snapshot 中出现文本不等于元素可见；必要时检查 `isVisible()`、bounding box 或实际布局尺寸。
- 页面异步加载时等待目标业务状态，不以首次 snapshot 作为最终结果。
- 不依赖动态端口、tab 下标、snapshot ref、窗口尺寸或当前业务页面。

App Action 写操作会弹出审批 UI。Agent 应先读取当前页面上的实际按钮，再点击对应按钮；不要用额外脚本猜测审批文案或批量自动确认。

## 覆盖范围

CDP 主要覆盖 Electron Renderer。以下内容需要结合 Astravia Debug 状态、持久化数据、主进程日志或专门的 Electron 集成测试验证：

- 原生文件选择器和系统 Dialog
- 系统托盘菜单
- 全局快捷键
- Electron 主进程内部状态
- 外部进程是否真实收到 Hook
