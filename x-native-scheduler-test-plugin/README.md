# X Native Scheduler Test Plugin

本地 Chrome/Edge 测试插件，支持原创帖队列和纯文字回复队列。原创可保存草稿或使用 X 原生定时；回复会逐条打开目标帖子并尝试使用回复编辑器中的 X 原生排期。

它不调用 X API，不上传到第三方平台，也不保存账号密码。执行时仍然是模拟你在网页上手动操作：打开发帖框、填入文本、上传媒体、点击日历按钮、设置日期时间、点击 Schedule。

## 安装或刷新

1. 打开 Edge 或 Chrome。
2. 进入 `edge://extensions` 或 `chrome://extensions`。
3. 打开“开发者模式”。
4. 如果之前已经加载过旧版，点扩展卡片上的“刷新”；如果没有加载过，点“加载已解压的扩展程序”。
5. 选择这个文件夹：

```text
D:\00_Formula\03_Coding\X-time\x-native-scheduler-test-plugin
```

## 操作流程

1. 打开 `https://x.com/home` 并确认已经登录。
2. 点击浏览器工具栏里的插件图标，它会打开一个独立悬浮窗口。
3. 选择顶部“原创排期”或“回复排期”。
4. 搜索并选择目标时区，例如 `UTC−07:00 · 旧金山`；排期窗口和文档时间都按目标时区计算。
5. 原创模式：在左侧发帖框输入一条帖子，或导入 `--- post ---` 队列。
6. 回复模式：导入 `--- reply ---` 队列，每条包含目标 `url` 和纯文字回复。
7. 预览目标时间和本机换算时间后点击“开始”。
8. 查看执行日志；回复失败后使用“从失败项继续”，已成功项目不会重复。
9. 完成后打开 X 的 `Unsent posts / Scheduled` 或草稿列表复核。

页面右下角不会出现 `XQ` 图标，所有操作都从插件独立窗口进入。

## 推荐 MD 格式

每条帖子用 `--- post ---` 分隔。每条可以带 `id`、`scheduled_at` 和 `media`：

```md
# X 发帖队列

timezone: Asia/Shanghai

--- post ---
id: post-001
scheduled_at: 2026-06-16 09:30
media: launch-cover.png

第一条帖子正文。

--- post ---
id: post-002
media: demo-video.mp4

第二条帖子正文。没有 scheduled_at 时，会按插件右侧设置自动补齐。
```

媒体规则：

- 手动输入时，媒体会直接绑定到当前草稿；保存后随这条帖子进入队列。
- 右侧预览会显示已匹配的图片或视频缩略图。
- `media:` 后写文件名，多个图片用逗号分隔，例如 `media: a.png, b.jpg`。
- 文件名必须和“媒体库”里选择的本地文件名一致。
- 一条帖子最多 4 张图片。
- 一条帖子如果使用视频，只能放 1 个视频，不能混合图片。
- 扩展测试版限制单个媒体和单次队列总媒体均不超过 25MB；大视频建议用 Playwright CLI 版本。

时间规则：

- 如果队列文件声明了 `timezone:`，它必须和插件选择的目标时区一致。
- 目标时区可以与浏览器时区不同；预览会同时显示两种时间。
- UTC 偏移按每条排期日期计算，自动处理夏令时。不存在或重复的 DST 本地时间会被拒绝。

## 回复队列格式

```md
timezone: America/Los_Angeles

--- reply ---
id: reply-001
url: https://x.com/example/status/1234567890123456789

第一条纯文字回复。

--- reply ---
id: reply-002
url: https://x.com/example/status/2234567890123456789
scheduled_at: 2026-06-19 15:30

第二条纯文字回复。
```

回复模式的安全规则：

- 只允许具体的 `x.com` / `twitter.com` 状态链接。
- 最终按钮必须明确显示 `Schedule / 定时 / 安排 / 排程` 才会点击。
- 找不到回复框原生排期按钮时立即停止，绝不改成立即回复。
- 失败状态会保存；恢复时不会再次执行已经标记为成功的回复。

## 编辑与 emoji

- 右侧预览区固定高度，帖子较多时在预览区内部滚动。
- 点击右侧任意帖子卡片，会把这条帖子载入左侧发帖框重新编辑；再次点击“保存”会替换原帖。
- emoji 面板使用本地打包的 `emoji-picker-element`，依赖文件位于 `vendor/`；emoji 数据从扩展包内 JSON 加载，不使用远程 CDN。

## 排期规则

选择“保存草稿”时，插件不会读取或生成发布时间，也不会打开 X 的定时弹窗；它会逐条打开发帖框、填入内容和媒体，然后保存为 X 草稿。

默认排期规则为“智能补齐”：有 `scheduled_at` 的导入帖按文档时间走；手动草稿填写了“草稿定时发布”时按手动时间走；没有指定时间的帖子由系统自动补齐。

自动补齐默认使用每日 `08:00-23:00` 窗口均匀分布。也可以切换到“固定间隔”，按设置的分钟间隔依次排期。

开启“不规则排期”后，插件只会给系统自动生成的时间加入 `±N` 分钟随机波动；文档指定和手动指定时间不会被随机改动。

如果自动排期超过当天窗口，插件会顺延到次日发布窗口继续排，不会再改到当前时间后 10 分钟。

## AI 写作规范

插件窗口里的“复制 AI 提示词”会把当前推荐规则复制到剪贴板。也可以把这个文件复制给 AI，让它按插件格式生成帖子：

```text
D:\00_Formula\03_Coding\X-time\X_POST_QUEUE_FORMAT_SKILL.md
```

插件内置模板和仓库示例保持一致：

```text
D:\00_Formula\03_Coding\X-time\x-native-scheduler-test-plugin\sample_queue.md
```

## 模拟测试文件

可直接测试图片和纯文本：

```text
D:\00_Formula\03_Coding\X-time\simulated_x_post_queue.md
D:\00_Formula\03_Coding\X-time\test-media\sample-image.png
```

视频格式示例：

```text
D:\00_Formula\03_Coding\X-time\simulated_x_post_queue_with_video.md
```

视频示例需要你自己放一个小 MP4 到 `test-media`，文件名为 `sample-video.mp4`。

## 本地验证

从仓库根目录运行：

```powershell
node --test tests/reply-core.test.cjs tests/timezone-core.test.cjs
node tools/validate-extension.mjs
```

## 限制

- 当前测试版支持普通文本、仅媒体帖、图片、小视频。
- 回复排期第一版仅支持纯文字。
- X 当前页面若不支持回复原生排期，回复队列会安全停止。
- 暂不支持 GIF、投票、线程和长文。
- 单个媒体和单次队列总媒体测试限制均为 25MB。
- 运行时需要保持 `x.com` 标签页打开。
- X 前端改版后，按钮或弹窗识别可能失效，需要维护 `content.js`。
- 先用 1-3 条测试，确认进入 X 原生定时列表后再批量运行。
- 插件不会绕过 X 的登录、安全校验、验证码、风控或平台规则。
