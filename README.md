# X-time

本仓库保存本地 Chrome/Edge 扩展 `X Native Scheduler Test Plugin`，支持原创帖队列和纯文字定时回复队列。原创帖使用 X 网页原生定时流程；回复任务由扩展保存并在目标时间自动打开帖子发送。两种模式共用可选择的目标时区。

扩展不调用 X API，不上传到第三方平台，也不保存账号密码。运行时依赖已经登录的 `x.com` 页面，并通过网页 UI 完成操作。

## 当前主扩展

```text
x-native-scheduler-test-plugin/
```

主要文件：

- `manifest.json`：扩展权限、内容脚本和后台脚本配置。
- `popup.html` / `popup.js`：独立窗口 UI、队列编辑、AI 队列导入、排期预览和执行入口。
- `timezone-core.js`：目标时区、UTC 偏移和夏令时换算。
- `reply-core.js`：回复队列解析、目标链接校验和恢复状态。
- `content.js`：注入 X 页面后执行原创排期，或在定时任务到点时发送单条回复。
- `background.js`：打开扩展窗口，持久化回复队列，并用浏览器闹钟在目标时间唤醒任务。
- `sample_queue.md`：推荐 Markdown 队列模板。
- `sample_reply_queue.md`：批量回复模板。
- `vendor/`：本地打包的 emoji picker 依赖，避免远程 CDN。

## 加载扩展

1. 打开 Edge 或 Chrome。
2. 进入 `edge://extensions` 或 `chrome://extensions`。
3. 打开“开发者模式”。
4. 选择“加载已解压的扩展程序”。
5. 选择仓库里的 `x-native-scheduler-test-plugin/` 文件夹。

如果已经加载过旧版本，修改代码后在扩展管理页点击“刷新”。

## 基本使用

1. 打开 `https://x.com/home` 并确认已经登录。
2. 点击浏览器工具栏里的扩展图标，打开独立排程窗口。
3. 选择“原创排期”或“回复排期”。
4. 在“目标时区”搜索并选择城市；所有时间窗口和 `scheduled_at` 都按该时区解释。
5. 原创模式可手动输入帖子或导入队列；回复模式批量导入多组目标链接和回复正文。
6. 如原创队列使用 `media:`，先在“媒体素材”里选择同名本地文件。
7. 预览中核对目标时区时间和本机换算时间。
8. 点击“开始”。回复任务会保存在扩展后台；到目标时间后自动打开帖子、填入正文并点击明确的回复按钮。
9. 完成后到 X 的 `Unsent posts / Scheduled` 或草稿列表里复核。

## 队列格式

每条帖子使用 `--- post ---` 分隔，元数据写在正文前：

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

没有 scheduled_at 的帖子会由插件按当前排期规则自动补齐。
```

更完整的写作规范见 `X_POST_QUEUE_FORMAT_SKILL.md`。

如果队列文件声明了 `timezone:`，它必须和插件当前选择的目标时区一致；否则插件会拒绝导入。UTC 偏移按排期日期动态计算，旧金山等城市的夏令时会自动处理。

回复队列使用独立格式：

```md
timezone: America/Los_Angeles

--- reply ---
id: reply-001
url: https://x.com/example/status/1234567890123456789

第一条纯文字回复。
```

回复模式只支持纯文字。X 本身没有原生回复排期，因此扩展必须在发送时间保持浏览器运行并保持 X 登录。失败后使用“恢复未发送任务”；已经发送成功的回复不会重复执行。若浏览器或标签页在点击发送期间中断，任务会标记为“结果未知”，要求人工检查后再决定是否恢复。

## 打包

发布包是由 `x-native-scheduler-test-plugin/` 目录生成的 zip：

```powershell
Compress-Archive -Path x-native-scheduler-test-plugin -DestinationPath x-native-scheduler-test-plugin.zip -Force
```

zip 属于可重新生成的本地交付物，默认不提交到 Git。

## 验证

提交前至少做一次轻量检查：

```powershell
node --test tests/background-reply-scheduler.test.cjs tests/reply-core.test.cjs tests/timezone-core.test.cjs
node tools/validate-extension.mjs
node --check x-native-scheduler-test-plugin/background.js
node --check x-native-scheduler-test-plugin/content.js
node --check x-native-scheduler-test-plugin/popup.js
```

浏览器端仍需用 1-3 条测试帖做实测，因为 X 前端结构变化可能导致按钮或弹窗识别失效。

## 限制

- 当前测试版支持普通文本、图片和小视频。
- 回复排期第一版仅支持纯文字。
- 定时回复依赖 Chrome/Edge 在目标时间运行；浏览器关闭期间错过的任务会在下次启动后尽快恢复。
- 暂不支持 GIF、投票、线程和长文。
- 单个媒体和单次队列总媒体测试限制均为 25MB。
- 扩展不会绕过 X 的登录、安全校验、验证码、风控或平台规则。
