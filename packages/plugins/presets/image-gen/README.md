# 图像生成（image-gen）

类 Grok 的文生图 / 图改图系统插件。

## 能力

- **输入栏「图像生成」开关（软隔离）**：插件通过 `PluginPromptDecoration.instructions` 注入本轮隐藏意图。**未开启时**插件注册的工具仍可用；开启则加强引导。agent 按 prompt 语义自行决定调用 `generate_image`（全新画面）还是 `edit_image`（修改已有图像）。
- **消息下方版本 swiper**：在生成图像的那条消息下横向排列该图编辑谱系的全部版本（超出可左右翻看），每张 hover 出「编辑」「导出」。同一谱系只在最新一条消息下渲染，生成中时最前面插入「生成中」骨架卡。
- **图改图统一从输入栏触发**：点某张图的「编辑」icon → 插件通过 `ui.setPromptAttachment` 绑定一次性编辑上下文，宿主只展示通用胶囊并在发送时合并隐藏指令，agent 调用 `edit_image` 以该图为 source。

## 配置（插件设置）

在「设置 → 插件设置」中按服务商配置：

- `provider`：服务商，`openai` / `agnes-ai` / `custom`
- `apiKey`：API Key（secret），三个服务商都需要
- `openaiModel` / `agnesModel`：内置服务商的模型下拉选择（目前各一个选项，后续可扩充）
- `baseUrl`、`model`：仅 `custom` 时显示并需要填写（标准 OpenAI v1 图像生成格式）

选中 `agnes-ai` 时，设置页会显示一条 `desc` 说明项，附带申请 API Key 的链接（可点击跳转外部浏览器）。

内置服务商的接口地址已固定，用户只需填 `apiKey` 并选择模型：

| provider | baseUrl | 可选模型（默认） |
| --- | --- | --- |
| `openai` | `https://api.openai.com/v1` | `gpt-image-2` |
| `agnes-ai` | `https://apihub.agnes-ai.com/v1` | `agnes-image-2.1-flash` |

输出尺寸不在设置中选择：由 agent 通过 `generate_image` 工具的 `size` 参数决定并传给模型（缺省 `1024x1024`）。

## 架构

插件拥有供应商适配、`generate_image` / `edit_image` 工具、隐藏提示、持久化记录和编辑谱系；desktop 只提供受 capability session 约束的 `ctx.network`、`ctx.storage`、`ctx.fs.readBinaryFile` 与通用 prompt attachment。私有数据写入 `~/.astravia/plugin-data/image-gen/`；旧版 `plugin-images` 数据会复制后迁移并保留 image id。详见 `docs/adr/0048-image-generation-owned-by-plugin-generic-network-storage.md`。
