# Windows Sandbox 中文文档

本文档面向 `codex-rs/windows-sandbox-rs`，聚焦独立可执行入口
`codex-windows-sandbox-host.exe` 的参数、策略和排障。

## 文档索引

- [sandbox-host-cn.md](/C:/me/codex/codex-rs/windows-sandbox-rs/docs/zh-CN/sandbox-host-cn.md)
  - `codex-windows-sandbox-host.exe` 全量参数说明、默认值、示例
- [policy-and-roots-cn.md](/C:/me/codex/codex-rs/windows-sandbox-rs/docs/zh-CN/policy-and-roots-cn.md)
  - `--policy`、`--read-root`、`--write-root`、`--deny-write-path` 的行为和覆盖关系
- [troubleshooting-cn.md](/C:/me/codex/codex-rs/windows-sandbox-rs/docs/zh-CN/troubleshooting-cn.md)
  - 常见报错与定位步骤

## 快速开始

```powershell
cd C:\me\codex\codex-rs
cargo build -p codex-windows-sandbox --bins

.\target\debug\codex-windows-sandbox-host.exe --policy workspace-write -- cmd /c "echo hello"
```

注意：

- 命令参数分隔符 `--` 之后的内容会被视为“要在沙盒中执行的命令”。
- 运行时状态目录默认在 `CODEX_HOME`（若未设置则回退到 `%USERPROFILE%\.codex` 或 `<cwd>\.codex`）。
