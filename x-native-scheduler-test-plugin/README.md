# X Native Scheduler Test Plugin

本地 Chrome/Edge 测试插件，用来手动保存单条帖子，或导入规范 Markdown 批量生成队列，然后通过 X 网页原生定时入口逐条排程。

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
3. 手动模式：在左侧发帖框里输入一条帖子，可选择或粘贴图片，再点击“保存”加入右侧队列。
4. 导入模式：点击“导入文件”，选择 `.md` 或 `.txt`，插件会自动识别多条帖子并生成右侧队列。
5. 如果导入文件里有 `media:` 字段，先在“媒体素材”选择同名图片/小视频。
6. 设置开始时间、结束时间、发布间隔和操作间隔。
7. 点击“预览队列”检查时间、内容和媒体预览。
8. 点击“开始”。
9. 查看底部“执行日志”。它会记录目标 X 标签页、页面脚本注入、媒体大小、队列发送和原始报错信息。
10. 完成后打开 X 的 `Unsent posts / Scheduled` 复核。

页面右下角不会出现 `XQ` 图标，所有操作都从插件独立窗口进入。

## 推荐 MD 格式

每条帖子用 `--- post ---` 分隔。每条可以带 `id`、`scheduled_at` 和 `media`：

```md
# X 发帖队列

timezone: Asia/Shanghai

--- post ---
id: post-001
scheduled_at: 2026-06-08 09:30
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
- 扩展测试版限制单个媒体 25MB；大视频建议用 Playwright CLI 版本。

## 编辑与 emoji

- 右侧预览区固定高度，帖子较多时在预览区内部滚动。
- 点击右侧任意帖子卡片，会把这条帖子载入左侧发帖框重新编辑；再次点击“保存”会替换原帖。
- emoji 面板由 `emoji-data.js` 提供本地分类数据，避免把 emoji 列表写死在主逻辑文件里。

## 排期规则

排期规则固定为：有 `scheduled_at` 的帖子按文档时间走；没有 `scheduled_at` 的帖子按开始时间和发布间隔自动补齐。

如果排出来的时间超过“结束时间”，插件会自动从当前时间 10 分钟后开始顺延；多条溢出时会继续按“间隔分钟”排。

## AI 写作规范

可以把这个文件复制给 AI，让它按插件格式生成帖子：

```text
D:\00_Formula\03_Coding\X-time\X_POST_QUEUE_FORMAT_SKILL.md
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

## 限制

- 当前测试版支持普通文本、图片、小视频。
- 暂不支持 GIF、投票、线程和长文。
- 运行时需要保持 `x.com` 标签页打开。
- X 前端改版后，按钮或弹窗识别可能失效，需要维护 `content.js`。
- 先用 1-3 条测试，确认进入 X 原生定时列表后再批量运行。
- 插件不会绕过 X 的登录、安全校验、验证码、风控或平台规则。
