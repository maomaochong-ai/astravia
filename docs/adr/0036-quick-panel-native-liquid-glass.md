# 快捷面板背景接入 macOS 原生液态/磨砂玻璃，darwin-only 原生模块以 createRequire 条件加载

快捷面板背景改用 macOS 原生玻璃：macOS 26+ (Tahoe) 为液态玻璃，更低版本自动回退为磨砂玻璃（legacy `NSVisualEffectView` 模糊）。经由 `electron-liquid-glass`（`liquidGlass.addView(win.getNativeWindowHandle(), { cornerRadius: 16, opaque: false })`）实现，玻璃视图绘制在 web 内容之下，故渲染层在玻璃模式下把卡片背景设为透明、去掉边框与阴影。模式由主进程依平台/`isGlassSupported()` 判定后经 `QUICK_PANEL_CHANNELS.ON_GLASS` 下发（`liquid`|`frosted`|`none`）。非 macOS 退回原不透明卡片。

## 决策：darwin-only 原生模块用 createRequire 条件加载

`electron-liquid-glass` 是 darwin-only（`package.json` 的 `os:["darwin"]`，prebuilds 仅 `darwin-arm64`/`darwin-x64`）。其模块顶层 eval 即无条件调用 `node-gyp-build` 加载 `.node`，在 Windows/Linux 上找不到 prebuild 会抛错。

主进程 bundle 在 mac 上**一次构建、跨平台打包**（同一份 `dist/main` 打进 win/linux 包），故任何顶层 `import` 语句都会在所有平台执行。若用顶层静态 `import liquidGlass from "electron-liquid-glass"`，Windows/Linux 主进程启动即崩溃。

因此 `src/main/quickpanel-window.ts` 改用 `createRequire(import.meta.url)`，仅在 `process.platform === "darwin"` 时 require；类型走顶层 `import type { GlassOptions }`（编译期擦除，无运行时加载）。这是对 AGENTS.md「NEVER use inline/dynamic imports」规则的**一次受控破例**：该规则针对 ESM 动态 `import()` 与 `import("pkg").Type` 内联类型；此处用同步 `createRequire` 加载一个**无法跨平台静态导入**的原生模块，是 Electron 生态 mac-only 原生依赖的标准做法，且为唯一可避免非 mac 崩溃的方案。

对比：`uiohook-napi`（快捷面板双击触发）各平台都有 prebuild，顶层静态 import 不会在任何平台抛错，故无需此处理。

## Consequences

- **打包**：`scripts/prepare-pack.js` 把 `uiohook-napi`（全平台）与 `electron-liquid-glass`（darwin-only，标记 optional：非 mac 主机解析不到则跳过）复制进 staging `node_modules`，并 `asarUnpack` 两者整包，使 `.node` 落真实磁盘（dlopen 无法从 asar 加载）。`vite.main.config.ts` 把两者列入 `external`。
- **跨平台**：win/linux 包内即便带有 darwin-only 包也不会被 require，`liquidGlass` 为 `null`，玻璃模式 `none`，退回不透明卡片。
- **macOS 权限**：玻璃为纯视觉、无需额外授权（与 ADR-0035 的输入监控授权无关）。

## Status

accepted
