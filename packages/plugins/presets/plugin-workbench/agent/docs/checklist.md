# 极简速查（细节以全文手册为准）

**完整开发手册**：同目录 `plugin/`（与仓库 `docs/plugin` 同步）。

创建/改插件前请按 skill 要求用 read 打开：

1. `plugin/README.md`
2. `plugin/getting-started.md`
3. `plugin/manifest.md` + `plugin/permissions.md`
4. 按扩展点：`plugin/ui-slots.md` / `plugin/conversation-and-agent.md` / …

## 最小可安装

- `plugin.json` + `dist/mf-manifest.json` + remoteEntry
- 构建：`scripts/build-and-pack.mjs`
- 安装：`plugins.manage` → `install-from-path`

## 用户工程依赖

`@astravia-org/plugin-sdk` / `@astravia-org/plugin-vite` 使用 **registry semver**，禁止 `workspace:*`。
