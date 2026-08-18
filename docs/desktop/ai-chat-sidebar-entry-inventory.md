# 主界面入口/按钮清单（阶段 0 基线）

> 目的：固化重构前主界面（左栏 / 中间聊天区 / 右栏）的全部可交互元素，作为后续
> 各阶段「零功能丢失」的逐项比对基准。任何阶段完成后，本清单中的每一项都必须
> 仍可点击且行为不变（除非该阶段明确声明并评审通过其变更）。
>
> 配套方案文档：[ai-chat-sidebar-progressive-refactor.md](./ai-chat-sidebar-progressive-refactor.md)

## 1. 左栏 Sidebar

### 1.1 顶栏 `SidebarTopBar`（desktop-app: `domains/project/components/sidebar/SidebarTopBar.tsx`）

| # | 入口 | 位置 | 触发路径 / 行为 |
| --- | --- | --- | --- |
| 1.1.1 | 品牌文本「Astravia」 | 顶栏左（非 Mac 显示） | 非交互，纯展示 |
| 1.1.2 | 工作模式徽章 `AgentModeBadgeDropdown` | 顶栏 actions 区 | 点击展开下拉：切换 Work / Coding（`AGENT_MODES`）；窄宽自动 compact 为仅 icon；aria-label 走 i18n |
| 1.1.3 | Claw 在线徽章 | actions 区（`imOnline` 时显示） | 点击 → `/settings/im`（IM 设置） |
| 1.1.4 | 折叠按钮 | actions 区最右 | 隐藏侧栏（`onCollapse` → `model.actions.collapse`） |

### 1.2 导航区 `SidebarNavigation`（模型：`useSidebarModel.ts`）

主导航 `PRIMARY_NAV_ITEMS`（5 项，点击走 `actions.openNavItem`）：

| # | 入口 | 目标 |
| --- | --- | --- |
| 1.2.1 | 新会话（`sidebar.nav.newSession`） | 解析目标 cwd（路由参数 → activeSession → 默认会话项目）后 → `/new-session/$cwd` |
| 1.2.2 | 自动化（`sidebar.nav.automation`） | `/automation` |
| 1.2.3 | 知识库（`sidebar.nav.knowledge`，带 beta 徽章） | `/knowledge`（子路径 `/knowledge/*` 也算激活） |
| 1.2.4 | 数据库（`sidebar.nav.database`） | `/database` |
| 1.2.5 | 能力（`sidebar.nav.skills`） | `/abilities`（子路径 `/abilities/*` 也算激活） |

「更多」收纳 `MORE_NAV_ITEMS`（4 项，经 more 按钮展开，含激活指示条 `navIndicatorBounds`）：

| # | 入口 | 目标 |
| --- | --- | --- |
| 1.2.6 | 批量任务 | `/batch-tasks` |
| 1.2.7 | 模型设置 | `/settings/models` |
| 1.2.8 | 智能体设置 | `/settings/context` |
| 1.2.9 | 外观 | `/settings/appearance` |

其他交互：
- 1.2.10 更多按钮（more trigger）：展开/收起收纳项。
- 1.2.11 侧栏宽度拖拽（`actions.resize` / `resizeEnd`）：180–400px，`localStorage[SIDEBAR_WIDTH_STORAGE_KEY]` 持久化。
- 1.2.12 导航激活指示条：随激活项滑动（layout effect 测量，无独立交互）。

### 1.3 项目/会话区 `SidebarProjectsSection` → `ProjectsPanel`

工具栏：
- 1.3.1 过滤器 `SidebarFilterSelect`：下拉选择会话过滤维度（options 来自 `useSidebarFilterSelectModel`）。
- 1.3.2 新建/打开/导入 `AddProjectMenu`：三个动作——
  - 新建项目 → `NewProjectDialog`（输入名称 → `createProject`）；
  - 打开项目 → 系统目录选择（`openProject`）；
  - 导入项目 → `window.astravia.project.import()`，成功后弹 confirm（部分/成功/失败分支）并可跳转 `/project/$cwd`。

面板 `ProjectsPanel`（模型 `useProjectsPanelModel.ts`）：
- 1.3.3 默认会话区 `DefaultConversationSection`：默认「对话」项目；会话行点击打开（`defaultSelectSession`，带 `handleDefaultSessionInteract` 自动调整分割比）；新建会话按钮；行内重命名（`DefaultSessionRenameInput`）。
- 1.3.4 项目分组区 `ProjectGroupsSection`：按分组展示用户项目（分组含批量任务组，取决于 filter）；`ProjectRow` 点击展开/折叠会话列表；自动 fit 展开项目（`autoFitExpandedProject`）。
- 1.3.5 会话行 `SessionRow`：点击打开会话；运行状态点/状态图标；行内重命名；右键菜单。
- 1.3.6 展开更多会话 `ShowMoreSessionsButton`：展开/收起隐藏的会话（`showAll` 切换）。
- 1.3.7 项目右键菜单 `ProjectContextMenu`：归档 / 移除 / 删除 / 清空会话 / 清空 Claw / 打开 Claw 设置（部分项按状态禁用）。
- 1.3.8 会话右键菜单 `SessionContextMenu`：删除会话。
- 1.3.9 分割手柄 `ProjectsPanelSplitHandle`：项目区与默认会话区高度比例（`sidebarProjectsSplitRatioAtom`，clamp 0.3–max）。
- 1.3.10 快速滚动标签：`quickScrollLabels`（滚动到底/顶，触顶/触底时出现）。
- 1.3.11 空态 `ProjectsPanelEmptyState`：无项目时引导（新建入口）。

### 1.4 底栏 `SidebarBottomBar`

- 1.4.1 更新条 `SidebarUpdateBanner`（更新就绪时显示）：左侧按钮悬停变「忽略」（dismiss），右侧「重启安装」（restart）。
- 1.4.2 设置菜单 `SettingsMenu`（`SettingsMenuTrigger` 展开 Popover）：
  - 1.4.2.1 工作模式切换区 `SettingsMenuAgentModeSection`（Work/Coding）；
  - 1.4.2.2 主题切换区 `SettingsMenuThemeSection`（浅色 / 深色 / 跟随系统，带过渡动画 `setMode`）；
  - 1.4.2.3 设置入口 `SettingsMenuSettingsItem` → `/settings/general`。

## 2. 中间聊天区

### 2.1 头部 `ChatHeaderActionsView`（`domains/chat/components/chat-view/ChatHeaderActionsView.tsx`）

| # | 入口 | 行为 |
| --- | --- | --- |
| 2.1.1 | `BackgroundTasksBadge` | 后台任务徽章（数量/状态提示，点击行为由组件内部定义） |
| 2.1.2 | `SandboxGrantsBadge` | 沙箱授权徽章 |
| 2.1.3 | 导出按钮（`exportTitle` / `exporting` / `exportDisabled`） | 导出会话 → `ChatExportHost`（`actions.openExport`） |
| 2.1.4 | 置顶按钮（`pinned` / `pinTitle`） | 切换会话置顶（`actions.togglePin`） |
| 2.1.5 | 面板开关（`panelOpen` / `panelTitle`） | 切换右栏 ActivityPanel（`actions.togglePanel`） |

### 2.2 消息列表 `MessageList`

- 2.2.1 消息线程：滚动浏览（无独立按钮）；转发 `onSend` / 中止 `onAbort` 回调暴露给消息内操作。

### 2.3 输入栏 `InputBar`（`input-bar/InputBarToolbar.tsx`）

| # | 入口 | 行为 |
| --- | --- | --- |
| 2.3.1 | 命令区按钮（skills，`slashOpen`） | 展开/收起命令面板（点击外部收起） |
| 2.3.2 | 插图按钮（`slashOpen` 展开形态下显示） | 图片选择器（`onSelectImages`） |
| 2.3.3 | 附件按钮（同上） | 文件选择器（`onSelectFiles`） |
| 2.3.4 | `ExecutionModeSelector` | 执行模式选择（Work/Coding 等） |
| 2.3.5 | `ActiveActionCapsules` | 已激活 input action 胶囊，可移除 |
| 2.3.6 | `ModelSelector` | 模型选择 |
| 2.3.7 | `ContextRing` | 上下文占用圆环（无点击交互，纯状态展示） |
| 2.3.8 | 排队按钮（流式中显示） | 排队追加消息（`onSend`） |
| 2.3.9 | `SendButton` | 发送（可发送时）/ 中止（流式中） |

状态条（参考对齐候选）：
- 2.3.10 `UsageBar`（`domains/chat/components/UsageBar.tsx`，**已实现、当前无挂载点**）：显示 `lastTurnUsageAtom` 的 `usageBar.speedLabel` + `usageBar.durationLabel`，无数据时返回 null。

## 3. 右栏 ActivityPanel

| # | 入口 | 行为 |
| --- | --- | --- |
| 3.1 | Tab 条 `TabBar` | 切换活动 tab；可移除（`onRemoveTab`，除 `file` / `knowledge-history` 外）；可拖拽排序（`onReorderTabs`） |
| 3.2 | Tab 选择器 `PluginTabPicker` | 恢复隐藏 tab、选择溢出 tab、附加插件 tab（`onRestoreTab` / `onSelectOverflow` / `onAttachPluginTab`） |
| 3.3 | 关闭按钮 | 关闭面板（`onClose`） |
| 3.4 | 宽度拖拽 `ResizeHandle` | 面板宽度调整（min/max 约束、`activityPanelWidthAtom` 持久化；窄屏切换 bottom sheet / narrow sheet） |
| 3.5 | Builtin tabs（9） | `file` 文件浏览 / `todo` 待办 / `workflow` 工作流 / `browser` 浏览器 / `database` 数据库 / `debug` 调试 / `background-tasks` 后台任务 / `batch-progress` 批量进度 / `knowledge-history` 知识历史 |
| 3.6 | 插件 tabs | 由插件注册（`activityTabs`），经 `useActivityTabDefinitions` 解析合并 |
| 3.7 | 保活 tab | `keepAliveWhenAvailable` 的 tab 常驻挂载、激活切换 display（避免 webview 重挂载） |

## 4. 比对方法（每个阶段完成后执行）

1. 对照本清单逐项点击验证：入口存在、位置合理、行为不变。
2. 变化项须在本清单中同步更新并注明所属阶段与评审结论。
3. 基线截图：`bun run verify:ui:*` 流程录制三栏形态快照存档，供后续视觉比对。
4. 每阶段结束跑 `bun run check` 全绿。
