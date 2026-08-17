# Git（系统插件）

在普通项目对话的活动面板里提供一个「Git」标签卡。

## 功能

- 检测当前项目目录是否为 Git 仓库（`git rev-parse --show-toplevel`）。
- 展示 `git status` 的全部变更（已暂存 + 未暂存 + 未跟踪）为**文件树**：
  - `M` 修改 / `A` 新增 / `D` 删除 / `R` 重命名 / `U` 未跟踪；折叠的文件夹含变更后代时打「●」。
  - 不列 gitignore 忽略文件（避免 `node_modules` 淹没）。
- 点击文件**内联展开 diff**（工作区 vs HEAD；未跟踪文件按新增合成）。
- 非 Git 项目展示「初始化仓库」CTA，点击执行 `git init`。
- 刷新：对话轮结束（agent 改文件后）+ 窗口重新聚焦 + 手动刷新按钮。

## 依赖的平台能力

- 活动面板标签卡：`ui.slot.activity-tab`，`scope_use: ["project"]`。
- 对话事件：`agent.session.read`（订阅 `turn-end`）。
- 命令执行：`agent.command.run` + `plugin.json` 的 `commands: ["git"]`。用户可在插件设置里关闭
  `git` 命令；关闭后调用被拦截并通知。详见 `docs/adr/0032`。

## 已知取舍（v1）

- **diff 渲染器自包含**（`components/DiffView.tsx` + `git/parseDiff.ts`，无语法高亮）。原计划用
  `@pierre/diffs`，因其依赖 shiki + web worker、在 Module Federation 下打包风险高而暂缓；DiffView
  已隔离，后续可平滑替换。
- **fs 文件监听自动刷新未实现**：插件 activity-tab 的 `ctx.fs` 不暴露 watch。以「窗口聚焦」作为
  外部改动的刷新替身；要做真正的 fs-watch 需给插件 API 补 `fs.watch`。

## 模块布局

```
src/
  index.tsx              # 仅注册 + 接线（thin entry）
  git/
    runtime.ts           # globalThis 单例：command API 持有 + 刷新总线
    run.ts               # git 命令封装（isRepo/status/diff/init）
    parseStatus.ts       # porcelain=v2 -z → ChangeEntry[]
    buildTree.ts         # ChangeEntry[] → 文件树
    parseDiff.ts         # unified diff → 可渲染行
    types.ts
  components/
    GitPanel.tsx         # 容器：检测/加载/刷新/渲染
    GitTree.tsx          # 递归树 + 文件行内联 diff
    DiffView.tsx         # 自包含 diff 渲染（隔离适配点）
    InitRepoCta.tsx      # 非 git 项目 CTA
    StatusBadge.tsx      # 状态码徽标 + 后代圆点
    icons.tsx            # 内联 SVG 图标
```
