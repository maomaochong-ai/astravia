# 策略与根目录覆盖机制（中文）

本文解释 `--policy` 与 roots 相关参数的组合行为，便于按预期收敛权限。

## 1. `--policy` 的两类输入

1. 预设字符串：
- `read-only`
- `workspace-write`

2. JSON：
- 必须能反序列化为 `codex_protocol::protocol::SandboxPolicy`。

拒绝项：

- `danger-full-access`
- `external-sandbox`

## 2. 可读根目录（read roots）来源

默认情况下（未传 `--read-root`）：

- 由实现根据策略与环境计算，包括 helper 所在目录、平台默认目录、策略声明的可读目录等。

传入 `--read-root` 后：

- 进入“显式覆盖”模式；
- 仅使用命令行给出的 `--read-root` 列表作为 read roots；
- 默认计算结果不再参与。

## 3. 可写根目录（write roots）来源

默认情况下（未传 `--write-root`）：

- 由策略 + `policy_cwd` + `command_cwd` + 环境推导可写路径。

传入 `--write-root` 后：

- 进入“显式覆盖”模式；
- 仅使用命令行给出的 `--write-root` 列表；
- 默认推导结果不再参与。

## 4. `--deny-write-path` 的作用

- `--deny-write-path` 可重复；
- 用于在“可写策略”里再次收紧某些路径；
- 典型用法：允许写 workspace，但拒写其中某些敏感子目录。

## 5. `--policy-cwd` 与 `--cwd` 的关系

- `--cwd`：子命令实际工作目录。
- `--policy-cwd`：策略中相对路径的解析基准目录。
- 未显式设置 `--policy-cwd` 时，默认等于 `--cwd`（或当前目录）。

建议：

- 当策略 JSON 使用相对路径且命令执行目录会变化时，显式指定 `--policy-cwd`，避免权限范围意外扩大或缩小。

## 6. `--proxy-enforced` 的影响

- 打开后会强制走 offline network identity；
- setup 会按 offline 路径应用代理端口与本地绑定策略；
- 该行为可覆盖“策略允许 full network”的身份选择结果。
