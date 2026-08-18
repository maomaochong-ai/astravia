# 主界面渐进式重构方案：对齐 BoardUI AiChatShell

> 目标：在不改变功能、不改变主题、不丢失现有按钮的前提下，参考
> [BoardUI AI Chat](https://www.boardui.com/components/ai-chat)（`AiChatShell`）
> 对项目主界面（左栏 / 中间聊天区 / 右侧面板）做渐进式重构。
> 本文档是方案，不是实施记录；实施时按阶段推进，每阶段独立可合并、可回滚。

## 0. 已确认的决策（2026-08-18）

| 决策点 | 结论 |
| --- | --- |
| 重构范围 | **三栏全部对齐**（左栏 + 中间聊天区 + 右侧 changes/code 面板） |
| 侧栏顶部形态 | **Agent 身份卡替换品牌栏**（模式徽章 + 当前项目 + 用量） |
| 项目/会话区形态 | **保留现有分组结构**，只加树状连接线（curved connector）+ 最近会话时间 chip |

## 1. 硬性约束（全部阶段的红线）

1. **零功能丢失**：阶段 0 先固化「入口/按钮清单」，每阶段结束逐项比对，任何入口不得消失。
2. **零主题破坏**：只用现有 token（`DESIGN.md` §1 的 token 类），不改 `styles.css` 的 CSS 变量与
   `@theme inline` 块；不引入新 collection 图标（统一 solar linear，见 DESIGN.md §6）。
3. **架构边界**（`docs/theme/sidebar-foundation.md`）：
   - theme-ui 保持 **props-driven view**，不接触 atom / router / IPC / domain hook；
   - desktop-app 是 connected 容器，状态、行为、i18n 解析留在 host 层；
   - 新展示组件遵循 root / decoration / content 三层结构，surface slot 只放 decoration 层；
   - 需要被主题装饰的新区块补充 `SidebarClassNames` / surface slot（如 `sidebar.identity`）。
4. **i18n**：所有新增用户可见文案走 i18n（key 进 `project` / `chat` ns 的 zh.json + en.json，
   tsc 基于 zh 资源做类型增强会拦截错误 key）。
5. **设计规范**：1px 线条、`rounded-xl/lg/md/full`、无阴影卡片、`transition-colors`、无手写 scrollbar、
   drag-region 规则全部沿用 `DESIGN.md`。
6. **每个阶段结束跑**：`bun run check`（含 desktop-app tsc）+ 相关 `test:pkg` / `test:changed`；
   涉及 UI 目测用仓库根 `bun run verify:ui:*` 入口，不用 `bun run dev`。

## 2. 现状 ↔ 参考结构映射

参考 `AiChatShell` 结构：agent 侧边栏（quick search / New agent / Automations / Customize /
repositories 树 + recent-chat 行 + 时间 chip / plan card）｜聊天容器（breadcrumb header /
消息线程 / composer + model picker / 带 context ring 的状态栏）｜固定宽度 changes/code 面板。

| 参考区块 | 现有实现（文件） | 对齐动作 |
| --- | --- | --- |
| Agent 身份区（agent 名/项目/角色/用量） | `SidebarTopBar`（品牌 + `AgentModeBadgeDropdown` + 折叠按钮 + Claw 徽章） | 阶段 1：身份卡替换品牌栏；模式徽章迁入身份卡，折叠/Claw/更新入口保留 |
| Quick search | `SidebarFilterSelect`（`filters/`） | 阶段 1：上移为顶部搜索条形态 |
| New agent / Automations / Customize | `SidebarNavigation`（`useSidebarModel` 的 `PRIMARY_NAV_ITEMS` + `MORE_NAV_ITEMS`） | 阶段 1：改为动作图标排布；全部 9 个入口保留（5 主 + 4 更多） |
| Repositories 树 + recent-chat 行 + 时间 chip | `SidebarProjectsSection` → `ProjectsPanel`（分组 + 项目行 + 会话行） | 阶段 2：分组结构不动，view 层加树线 + 时间 chip（props 派生，不碰数据模型） |
| Plan card（Upgrade 按钮） | `SidebarBottomBar`（`SidebarUpdateBanner` + `SettingsMenu`） | 阶段 1/2：保留两按钮，视觉按 plan card 形态微调 |
| Breadcrumb header | `PageHeader`（`shared/app-shell/page-header`） | 阶段 3：评估强化面包屑感，尽量不动共用壳 |
| Status bar + context ring | `UsageBar`（已实现**未挂载**）+ `ContextRing`（已在 `InputBarToolbar`） | 阶段 3：挂载 `UsageBar` 为聊天底部状态栏 |
| 固定宽度 changes/code 面板 | `ActivityPanel`（已是固定宽、可拖动、宽度持久化） | 阶段 4：对齐固定宽度行为与视觉（`activity-atoms.ts` 已有 min/max 约束） |

## 3. 阶段划分

### 阶段 0：基线固化（只读 + 文档，无代码改动）

**产物：入口/按钮清单**（存 `docs/desktop/ai-chat-sidebar-entry-inventory.md`）。
逐项列出侧栏全部可交互元素及其触发路径，来源文件：

- `useSidebarModel.ts`：`PRIMARY_NAV_ITEMS`（新会话/自动化/知识库/数据库/能力）、`MORE_NAV_ITEMS`（批量任务/模型设置/智能体设置/外观）、more 收纳、宽度拖拽
- `SidebarTopBar` / `AgentModeBadgeDropdown`：折叠按钮、模式切换 dropdown
- `SidebarProjectsSection`：`SidebarFilterSelect`、`AddProjectMenu`、项目/会话行右键菜单、会话打开、`ShowMoreSessionsButton`
- `SidebarBottomBar`：`SettingsMenu`（含主题/额度/账号/下载等子入口）、`SidebarUpdateBanner`
- 中间/右栏：`ChatHeaderActionsView`、`InputBar` 工具栏（ContextRing/模型选择/执行模式/技能等）、`ActivityPanel` tab 条与插件 tab

**验证**：清单评审通过；`bun run check` 绿；`verify:ui:status` 记录基线。
**回滚**：无代码改动，不适用。

### 阶段 1：左栏结构重组（纯布局，功能零变化）

改动面：`theme-ui/sidebar`（新增展示组件）+ `desktop-app` sidebar host（重组装配）。

1. 新增 `theme-ui/sidebar/AgentIdentityCard.tsx`：
   - props：`modeLabel` / `modeIcon` / `projectLabel` / `usageText` / `onCollapse` 等语义回调 + `classNames`；
   - 视觉：头像/模式图标块 + 名称 + 当前项目 + 用量（参考截图 agent 身份区）；
   - 遵循 root/decoration/content 三层，注册 `sidebar.identity` surface slot（在 theme-ui 与
     `docs/theme/sidebar-foundation.md` 同步补充）。
2. `desktop-app` host：
   - `DefaultSidebar.tsx`：topBar 的品牌区替换为身份卡（数据来自 `useAgentMode`、
     `defaultConversationCwdAtom`、`useUsageBarModel`——`UsageBar` 的 model 已存在，先取 usage 文本）；
   - `AgentModeBadgeDropdown` 迁入身份卡（保留原 dropdown 全部行为，含 compact 自适应）；
   - `SidebarFilterSelect` 上移到导航区顶部，改为 quick-search 形态（保留原过滤行为与全部过滤项）；
   - `SidebarNavigation` 主动作区按参考「New agent / Automations / Customize」意象重排图标按钮，
     但**9 个入口全部保留**（5 主 + 4 收纳），label 走 i18n key；
   - `SidebarBottomBar` 保留两按钮，容器按 plan card 形态微调（token 内）。
3. 窄屏 overlay 复用同一 `Sidebar`，同步适配（floating 分支）。

**验证**：阶段 0 清单逐项比对（重点：折叠按钮、模式 dropdown、filter、add-project、设置菜单、
更新入口、9 个导航入口）；`bun run check`；`verify:ui` 目测。
**回滚**：单 commit 回滚；若身份卡数据源（用量文本）未就绪，先只做结构不动数据。

### 阶段 2：repositories 树视觉（tree connector + 时间 chip）

改动面：`theme-ui/project`（`ProjectRowView` / `SessionRowView` / `DefaultSessionRowView`）
+ `desktop-app` model 层派生 props。

1. theme-ui 新增纯展示组件：
   - `TreeConnector`：curved connector 连线（border token，1px，参考截图树线）；
   - `TimeChip`：最近会话相对时间 chip（复用 desktop-app `quickpanel/relativeTime.ts` 逻辑或
     theme-ui 内等价纯函数，配单元测试）。
2. 行组件 props 增加可选 `treeDepth?` / `timeLabel?`（**不破坏现有 props 契约**，
   `classNames` 相应扩展），未传时渲染行为与现状完全一致。
3. desktop-app model 层（`useProjectRowModel` / `useSessionRowModel` / `useDefaultSessionRowModel`）
   派生 treeDepth 与时间标签——纯派生，不改 `ProjectsPanel` 数据模型与分组逻辑。
4. 项目行/会话行的右键菜单、拖拽、重命名、执行模式等交互一律不动。

**验证**：分组结构、右键菜单、会话操作零回归；relativeTime / connector 相关单测；
`bun run check`；`verify:ui` 目测树线在深浅主题下均清晰。
**回滚**：props 可选 + 未传走旧渲染，可直接摘除新组件。

### 阶段 3：中间栏对齐（breadcrumb header + status bar）

1. `PageHeader` 评估：若现有 header 已具面包屑感则不动（它被所有 content 页面共用，改动面大、
   收益低——**默认不做**，仅在确认参考差异明显时做 token 内微调）。
2. 挂载 `UsageBar` 为聊天底部状态栏：确认挂载点（`DefaultChatView` 消息区底部 vs 输入栏下方）、
   窄屏行为、与 `ContextRing`（已在 `InputBarToolbar`）的关系；`UsageBar` 目前无任何页面挂载，
   需先在 `useUsageBarModel` 确认数据可用性。
3. 若状态栏需要「用量百分比 + context ring」组合形态，在 theme-ui 组合层做，不碰聊天业务逻辑。

**验证**：发送 / 流式 / 队列 / 中止 / appshot 等聊天功能无回归；窄屏不挤压输入区；
`bun run check`；`test:changed`。
**回滚**：挂载点单点回滚，聊天业务零改动。

### 阶段 4：右栏对齐（changes/code 面板）

1. `ActivityPanel` 已是固定宽、可拖动、宽度持久化（`activity-atoms.ts` 已有
   `ACTIVITY_PANEL_MIN_WIDTH` / `activityPanelMaxWidth` / 持久化），核对是否满足「固定宽度」语义，
   必要时补默认宽度与记忆行为，不动 tab 系统与插件 tab。
2. 视觉微调（边框 / tab 条 / 面板底色）全部 token 内，按 DESIGN.md。
3. 回归三个挂载点：`DefaultChatView`、`SessionViewerPage`（两处）、`NewSessionPageView`、
   `ProjectDetailPage`。

**验证**：三栏并存与窄屏（bottom sheet）行为无回归；插件 tab / 保活 tab 无回归；
`bun run check`。
**回滚**：仅视觉层，回滚成本低。

### 阶段 5：收尾与全量验证

1. 全量 `bun run check`（Biome + tsgo + desktop-app tsc + guards）。
2. `verify:ui:start / status / attach / stop` 走一遍三栏形态目测（深浅主题）。
3. i18n 新增 key 的 zh/en 补齐；`CHANGELOG.md`（desktop-app）补 `[Unreleased]` 条目。
4. 阶段 0 入口清单终检；截图对比参考（用户侧确认观感）。

## 4. 风险与决策点

| 风险 | 对策 |
| --- | --- |
| 身份卡需要「用量 + 当前项目」数据，`UsageBar` 未挂载 | 阶段 1 只用 model 的 usage 文本；完整状态栏放到阶段 3，避免阶段 1 依赖未挂载功能 |
| 树线/时间 chip 破坏分组数据模型 | 只在 view 层加可选 props，model 只做派生；未传 props 渲染完全一致 |
| 主题系统边界被破坏（theme-ui 接触 store/IPC） | 阶段评审按 `sidebar-foundation.md` 契约检查；新组件必须 props-driven |
| 品牌「Astravia」弱化 | 已确认身份卡替换品牌栏；品牌文案可在身份卡内保留（i18n key），可配置 |
| 阶段 3 改 `PageHeader` 影响所有 content 页面 | 默认不动，仅评估；确需改时以 props 增量方式（`breadcrumb?`）扩展，不改现有默认渲染 |
| 截图观感差异（当前模型无法读图） | 每阶段 `verify:ui` 截图后由用户侧确认观感，再进下一阶段 |

## 5. 验收标准（整体）

- 阶段 0 入口清单中的所有按钮/入口在最终界面中均可点击且行为不变。
- `bun run check` 全绿；相关单测通过。
- 视觉：左栏 agent 身份卡 + quick search + 动作区 + 树线时间 chip 列表 + plan card 区；
  中间状态栏；右侧固定宽面板——与参考截图观感一致（用户确认）。
- 深浅主题下 token 正确，无硬编码色、无新增阴影/圆角/线条违规（DESIGN.md §9 checklist）。
