# 常见问题排查（中文）

## 1. `unknown argument: ...`

原因：

- 传入了未支持参数，或把子命令参数写在了 `--` 之前。

处理：

- 先运行 `codex-windows-sandbox-host --help`；
- 确保 host 参数在前，子命令参数在 `--` 之后。

## 2. `missing command. Use -- <COMMAND> [ARGS...]`

原因：

- 没有提供子命令。

处理：

- 使用标准格式：
  - `codex-windows-sandbox-host [OPTIONS] -- <COMMAND> [ARGS...]`

## 3. `--env expects KEY=VALUE, got ...`

原因：

- `--env` 参数格式错误。

处理：

- 使用 `--env NAME=value`；
- 如果 value 里包含空格，按 shell 规则加引号。

## 4. 超时退出

现象：

- 输出 `sandbox command timed out`；
- 退出码为 `192`。

原因：

- 命令执行超过 `--timeout-ms`。

处理：

- 增大 `--timeout-ms`；
- 或先在非沙盒环境定位慢点，再收敛策略后重试。

## 5. Setup/权限相关失败

优先查看：

- `CODEX_HOME\.sandbox\sandbox.log`
- `CODEX_HOME\.sandbox\setup_error.json`（如果 setup 失败）

建议定位顺序：

1. 确认 `--codex-home` 是否指向可写位置。
2. 确认 `--read-root` / `--write-root` 是否误收窄。
3. 如果使用 JSON policy，核对路径是否相对 `--policy-cwd` 解析。
4. 如使用代理，确认 `--proxy-enforced` 与环境代理变量是否符合预期。
