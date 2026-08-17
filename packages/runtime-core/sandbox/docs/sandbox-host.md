# `codex-windows-sandbox-host.exe` 使用说明（中文）

`codex-windows-sandbox-host.exe` 是 Windows 沙盒能力的推荐独立 CLI 入口。
它会调用 `run_windows_sandbox_capture_elevated(...)`，并直接转发子进程
`stdout/stderr`。

## 命令格式

```text
codex-windows-sandbox-host [OPTIONS] -- <COMMAND> [ARGS...]
```

## 常用示例

1. 工作区可写策略：

```powershell
.\codex-windows-sandbox-host.exe --backend auto --policy workspace-write -- cmd /c "echo HOST_OK"
.\codex-windows-sandbox-host.exe --backend unelevated --policy workspace-write -- cmd /c "echo HOST_OK"
.\codex-windows-sandbox-host.exe --backend elevated --policy workspace-write -- cmd /c "echo HOST_OK"
.\codex-windows-sandbox-host.exe --policy workspace-write -- cmd /c "echo HOST_OK"
```

2. 清空继承环境并显式设置 `PATH`：

```powershell
.\codex-windows-sandbox-host.exe --clear-env --env PATH=C:\Windows\System32 -- cmd /c ver
```

3. 传入 JSON 策略：

```powershell
.\codex-windows-sandbox-host.exe --policy-cwd C:\work --policy "{\"type\":\"read-only\"}" -- powershell -NoProfile -Command Get-ChildItem
```

## 参数详解

`-h`, `--help`

- 输出完整帮助说明。

`--policy <read-only|workspace-write|JSON>`

- 指定沙盒策略。
- 默认值：`read-only`。
- 支持：
  - `read-only`
  - `workspace-write`
  - `SandboxPolicy` JSON 字符串
- 不支持（会报错）：
  - `danger-full-access`
  - `external-sandbox`

`--backend <auto|elevated|unelevated>`

- 选择 Windows 沙盒后端。
- 默认值：`auto`。
- `elevated`：强制走管理员 setup/runner 路径。
- `unelevated`：强制走非管理员 restricted-token 路径。
- `auto` 选择规则：
  1. 传了 `--proxy-enforced` 时使用 `elevated`；
  2. 传了 `--read-root`、`--write-root`、`--deny-read-path`、`--deny-write-path`、`--temp-root`
     或 `--network none` 时使用 `elevated`；
  3. 策略需要受限读权限时使用 `elevated`；
  4. 其他情况下，若已存在 setup marker 则使用 `elevated`；
  5. 若 setup 未完成则回退到 `unelevated`。

`--policy-cwd <PATH>`

- 作为策略中相对路径解析的基准目录。
- 默认值：`--cwd` 的值（若未指定 `--cwd`，则是当前进程目录）。

`--cwd <PATH>`

- 子命令的工作目录。
- 默认值：当前进程目录。

`--codex-home <PATH>`

- 运行时状态目录（日志、setup marker、helper 副本等）所在根目录。
- 默认解析顺序：
  1. 显式 `--codex-home`
  2. 环境变量 `CODEX_HOME`
  3. `%USERPROFILE%\.codex`
  4. `<cwd>\.codex`

`--timeout-ms <U64>`

- 命令超时时间（毫秒）。
- 超时后会终止子进程，打印 `sandbox command timed out`，并以 `192` 退出。

`--private-desktop`

- 请求使用 private desktop 模式（主要影响 TTY/ConPTY 路径）。

`--proxy-enforced`

- 即使策略声明允许网络，也强制走 offline network identity 路径。
- 会影响 setup/refresh 期间选择的身份与离线代理相关设置。
- 仅 `elevated` 后端支持。

`--read-root <PATH>`（可重复）

- 显式覆盖“可读根目录”列表。
- 只要出现至少一次，就不再使用默认计算结果。
- 仅 `elevated` 后端支持。

`--write-root <PATH>`（可重复）

- 显式覆盖“可写根目录”列表。
- 只要出现至少一次，就不再使用默认计算结果。
- 仅 `elevated` 后端支持。

`--deny-write-path <PATH>`（可重复）

- 额外的拒写路径（即使在 `workspace-write` 下也保持不可写）。

`--deny-read-path <PATH>`（可重复）

- 额外的拒读路径。
- 拒读优先级高于 `--read-root`。
- 仅 `elevated` 后端支持。

`--temp-root <PATH>`

- 为本次命令指定隔离临时目录。
- 子进程的 `TEMP` 和 `TMP` 会指向该路径。
- 该路径会自动加入可写根目录。
- 宿主 `%TEMP%` / `%TMP%` 不会因此自动可写，除非它们就是这个路径。

`--network <none|default>`

- `default`：跟随沙盒策略。
- `none`：强制使用 offline sandbox identity 和出站防火墙阻断。
- 仅 `elevated` 后端支持。

`--capabilities --json`

- 输出被动能力 JSON 后退出。

`--probe --json`

- 输出能力 JSON 后退出；当前不会运行主动探测场景。

`--env <KEY=VALUE>`（可重复）

- 为子进程设置或覆盖环境变量。
- 默认会先继承当前进程环境。

`--clear-env`

- 清空继承环境后再应用 `--env`。
- 参数顺序生效：若在若干 `--env` 之后再出现 `--clear-env`，前面的 `--env` 也会被清空。

## 解析规则

- 所有 `codex-windows-sandbox-host` 自身参数必须放在 `--` 之前。
- `--` 之后的所有内容都按“子命令+子命令参数”原样处理。
- 未知参数会立即报错。
- 没有给出子命令会报错：`missing command. Use -- <COMMAND> [ARGS...]`。

## 输出与退出码

- 子进程 `stdout/stderr` 会转发到宿主控制台。
- 正常情况下，host 退出码等于子进程退出码。
- 超时时，host 退出码为 `192`。
