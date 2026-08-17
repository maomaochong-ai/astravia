---
status: accepted
---

# feishu 图片/文件/富文本全形态收发：复用 ADR-0006 单轨，抽出共享 inbox 包

ADR-0006 把媒体收发的两条主干（入站统一走 [[mentionedFile]] 单轨落盘、出站走 `im_send_attachment` + [[host_request / host_response]] 反向 RPC）落定在 wechat 上，并明文把 feishu 列为「不在范围」。这一轮把同一套形态扩展到 feishu，并新增 wechat 没有的 `post` 富文本入站。架构主干完全继承 0006——不重新论证单轨 vs `images[]`、工具回调 vs digest 扫描——本 ADR 只记录 feishu 特有的取舍。

落地几乎全在 transport 层（`internal/transport/feishu/feishu.go`）：上层全部平台无关、零改动。router 的 `@<abspath>` 拼接（`router.go`）对任何填好 `Attachment.URL` 的 transport 自动生效；host-bridge 在嵌入模式恒开（`host.go`），`im_send_attachment` 工具对 feishu 会话早已注册；transport 接口的 `SendAttachment` 早已存在，feishu 此前只是硬报错占位。coding-agent 主包不动。

feishu 特有的几个一锤定音：

- **入站下载无解密步骤。** wechat 要先 CDN 下载再 AES-128-ECB 解密；feishu 走鉴权后的 `Im.MessageResource.Get(message_id, file_key, type)`，SDK 直接回放明文流。下载在 larkws 的 per-frame goroutine（`ws/client.go` 每个数据帧 `go handleMessage`）里同步进行，不阻塞心跳与其它事件，故沿用 wechat 的同步下载写法，不引入额外的 handoff。

- **新增 `post` 富文本入站。** 把 post 的文本 run（含链接 / @）拍平进 `Text`，正文内嵌的每个 `image_key` 当作一个 image 附件、与独立 image 消息走同一条下载路径。audio / video / merge_forward / sticker 仍不支持，回一句（准确的）提示后丢弃。

- **出站 image 失败回退成 file。** `Im.Image.Create` 仅收 jpg/png/webp/gif/bmp 等有限格式；agent 传来的 image 若被格式/大小拒收，改走 `Im.File.Create(FileType=stream)` 把原字节作为文件发出，保证用户「总能拿到东西」而非静默丢失。普通 file 的 `FileType` 按扩展名映射到 feishu 枚举（pdf/doc/xls/ppt/mp4/opus），其余默认 `stream`。

- **caption 走跟发文本，不嵌卡片。** feishu 没有 wechat 的 per-peer quota，本可把图文塞进同一张 interactive 卡片；但卡片内嵌只对 image 成立、file 仍需 msg_type=file，image/file 两条路径会不对称。为与 wechat 行为一致、image/file 统一，caption 一律作为附件之后的独立文本消息发送。

- **抽出共享包 `internal/transport/inbox`。** [[im-gateway inbox]] 的按日分目录落盘、防覆盖、文件名 sanitize、扩展名/MIME 推断原是 wechat 包内未导出函数；feishu 需要逐字相同的逻辑。提到共享包收敛为单一实现，避免两份随命名/防覆盖策略改动而飘移。代价是动了 wechat.go（改调共享包），超出纯「只动 feishu」的范围，属可接受的一次性重构。

如果未来 feishu 的 IM 用户体验证明「Read 调用才看图」不可接受，应按 ADR-0006 末尾的口径，给 transport 加 capability 控制入站图片是否同时进 `images[]`，而不是替换掉 [[mentionedFile]] 单轨。
