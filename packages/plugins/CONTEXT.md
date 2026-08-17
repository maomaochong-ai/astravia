# 插件平台 — 上下文术语表

> 本文件是 glossary，只定义语言、不放实现细节。

## 命令能力 (Command Capability)

插件 renderer 经新 IPC 触发**宿主主进程**执行命令的能力。出口为通用的
`ctx.command.run(file, args[], opts)`（execFile 语义：不走 shell、参数数组传递、buffered
返回 `{ stdout, stderr, exitCode }`）。是 git/python/node 等「内置运行时」调用的统一通道。

对应权限值 `agent.command.run`（此前是占位符，本次为其补上真实 API）。

## 命令声明 (Declared Command)

插件在 `plugin.json` 中**显式声明**它需要执行的命令。声明之外的命令一律拒执行。
声明的命令会在宿主插件配置页向用户暴露，用户可**逐条勾选 / 关闭**。

**粒度 = 可执行文件名**（如 `git`）。声明一个二进制即放开它的全部子命令
（`git status` 与 `git push` 不区分）。授权 / 拦截也以二进制为单位。

## 命令拦截 (Command Interception)

运行时门控：当插件调用一条**被用户关闭**的已声明命令时，宿主拦截该次调用并**通知用户**，
而非静默失败。区别于「未声明命令」——后者是硬拒绝。

---

# 插件 i18n — 上下文术语表

## NLS 占位符 (NLS Placeholder)

宿主渲染的插件字符串里 `%key%` 形态的标记，表示「这是 catalog key，去查译文」。
统一约定：贯穿 `plugin.json` 字段、`ctx.ui.register*()` 的 `label`、以及任何**由宿主
渲染**的插件字符串。宿主检测到 `%...%` 即查 catalog，否则当字面量（向后兼容现有裸串）。

不含插件**自己** React 组件内渲染的文字——那些直接走 SDK 的 `ctx.i18n.t()` / hook，
不用占位符。

## 插件 Catalog (Plugin Catalog)

插件包内的 sidecar 译文文件 `locales/<lang>.json`（扁平 key→译文）。**一套 catalog 同时
服务两端**：manifest 占位符解析 + 运行期组件 `t()`。由**宿主加载**（main 读取，因为
manifest 在 main 解析），随 `InstalledPlugin` 送到 renderer；插件自身不 import catalog。

## locale 同步 (Locale Sync)

插件的「当前语言」永远等于宿主当前语言（语言真相源仍是 main 的 desktop-config.json）。
SDK 向插件暴露响应式当前 locale + `t()`。宿主切语言时**全程实时**：插件 React 组件、
manifest 派生展示、`register*` 的 `%key%` label 都重渲染跟随，无需 reload / 重跑 activate。

---

# Git 插件 — 上下文术语表

## 变更文件 (Changed Files) — 原需求口语「暂存区文件」

实际范围 = `git status` 的**全部变更**：已暂存（索引）+ 未暂存（工作区）+ 未跟踪。
**不是**狭义暂存区（git index）。面板把同一文件的 XY 两列状态**合并**成单一状态码展示。

状态码图例：`M` 修改 / `A` 新增(已暂存) / `D` 删除 / `R` 重命名 / `U` 未跟踪 /
`ignored`(gitignore，弱化样式) / `●` descendant（文件夹含已变更后代）。

数据源 `git status --porcelain=v2 --untracked-files=all -z`（**不加 `--ignored`**）。
`ignored` 仅为设计语言保留，v1 **不**把忽略文件铺进树（否则 node_modules 淹没面板）。

`●` descendant 暗示面板是**文件树**结构（文件夹可折叠，含变更后代时打点）。

**v0.2 起树由 `@pierre/trees`（trees.software）渲染**：path-first、shadow DOM 自带样式，
内建 git 状态徽标（M/A/D/R/U）与 descendant 指示，无需我们自绘 badge/dot。我们把变更集
拍平成 `paths[]` + `gitStatus[]`（`git/gitStatus.ts`）喂给它；主题经 `themeToTreeStyles` +
override CSS 变量从宿主 `--background/--foreground/--border/--accent` 派生（`components/hostTheme.ts`，
跟随 `data-mode` 切换）。选中态外提到容器组件，树本身不持有 diff。

## 面板挂载

Git 面板 = 一个 activity tab（`registerActivityTab`）。

- **不需要手动 attach**（doc/ui-slots.md 过时）：当前 `ActivityPanel.tsx` 按面板宽度用
  响应式 `TabBar` 自动展开/收纳 tab；插件 tab 已按 `scope_use` × 当前 scenario 过滤。
- Git tab 设 `scope_use: ["project"]` → **仅在 project 类型对话出现**（fail-closed）。
- **非 git 项目**：tab 仍出现，但面板内渲染「初始化仓库」CTA，点击执行 `git init`
  （写命令，仍归 `git` 二进制声明覆盖）。

## Diff 组件

**v0.2 起采用 `@pierre/diffs`**（diffs.com，基于 Shiki 高亮）：`<PatchDiff patch=… disableWorkerPool>`
直接吃 unified patch 字符串，主题随宿主 `data-mode` 在 `github-dark-default`/`github-light-default`
间切换。`disableWorkerPool` 避免 MF 下的 worker 文件解析；shiki 各语言被 vite 拆成懒加载 chunk
（构建产出 ~300+ 运行时文件，从插件源加载，同 [[project_lottie_studio_plugin]] 的 MF 资源机制）。
**已无头构建验证打包通过。**

自包含的 `components/DiffView.tsx` + `git/parseDiff.ts`（无高亮 unified 渲染器）**保留为兜底**：
`DiffPane` 用 error boundary 包住 `PatchDiff`，富渲染器初始化失败时回退到 DiffView，面板不致白屏。

## 打包形态

系统插件（preset）：`packages/plugins/presets/git/`，`source: "system"`，随 App 发布、
权限（含 `agent.command.run`）自动全量授予；用户仍可在设置页逐条关闭声明的命令。

## 刷新策略

触发重跑 `git status` → 重建树（不轮询）。**v1 实际**：
1. 对话轮结束：订阅 `conversation.on` 的 `turn-end`，接住 agent 改动（经 globalThis 刷新总线）。
2. 窗口重新聚焦：`window focus` 监听，接住外部编辑器改动。
3. 手动刷新按钮：兜底。

**偏差**：原计划的「fs 文件监听自动刷新」未实现——插件 activity-tab 的 `ctx.fs` 不暴露
watch；要做需给插件 API 补 fs.watch（后续）。window-focus 作为其替身覆盖大部分外部改动场景。

## 单文件 diff 来源

工作区 vs HEAD（`git diff HEAD -- <path>`），与合并视图一致。未跟踪文件用
`git diff --no-index /dev/null <file>` 合成「新增」patch。

**v0.2 起 diff 不再 inline 手风琴展开，改为右侧分屏**（学「文件活动面板」）：左树 + 右 diff，
中间可拖拽分隔条（`SplitHandle`，可把树拖窄/收起）。**显隐受拉伸驱动**：`GitChanges` 用
`ResizeObserver` 测自身宽度，选中文件且容器 ≥ `DIFF_MIN_WIDTH` 才展示 diff，拖窄自动收起——
等价于宿主文件面板的「宽度驱动预览」，但用容器测量替代宿主的 `activityPanelWidthAtom`（插件读不到）。

## v1 动作边界

只读：状态树 + 右侧分屏 diff。唯一写操作 = 非 git 项目的「初始化仓库」CTA（`git init`）。
**不含** stage/unstage/commit/discard（留待后续版本）。
