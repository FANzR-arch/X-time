# X-time

本仓库保存本地 Chrome/Edge 扩展 `X Native Scheduler Test Plugin`，支持原创帖队列和纯文字回复队列，并通过 X 网页原生定时流程排期。原创与回复共用可选择的目标时区。

扩展不调用 X API，不上传到第三方平台，也不保存账号密码。运行时依赖已经登录的 `x.com` 页面，并通过网页原生发帖/定时 UI 完成操作。

## 当前主扩展

```text
x-native-scheduler-test-plugin/
```

主要文件：

- `manifest.json`：扩展权限、内容脚本和后台脚本配置。
- `popup.html` / `popup.js`：独立窗口 UI、队列编辑、AI 队列导入、排期预览和执行入口。
- `timezone-core.js`：目标时区、UTC 偏移和夏令时换算。
- `reply-core.js`：回复队列解析、目标链接校验和恢复状态。
- `content.js`：注入 X 页面后执行原创发帖或单条原生回复排期。
- `background.js`：打开扩展窗口，并持久化编排跨多个目标页面的回复队列。
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
4. 在“目标时区”搜索系统支持的 IANA 城市时区；需要长期使用时点击“保存为默认时区”。所有时间窗口和 `scheduled_at` 都按该时区解释。
5. 原创模式可手动输入帖子或导入队列；回复模式批量导入多组目标链接和回复正文。
6. 如原创队列使用 `media:`，先在“媒体素材”里选择同名本地文件。
7. 预览中核对目标时区时间和本机换算时间。
8. 点击“开始”。回复任务会逐条打开目标帖子并尝试使用回复框里的原生排期。
9. 完成后到 X 的 `Unsent posts / Scheduled` 或草稿列表里复核。

自动排期默认使用“今天智能开始”：如果目标时区当前时间仍在每日窗口内，首批从当前时间加 10 分钟开始；如果已超过每日结束时间，则从次日的每日开始时间继续。也可以切换为“固定每日开始时间”。

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

回复模式只支持纯文字。如果某条回复编辑器没有明确的原生 `Schedule / 定时` 按钮，插件会跳过该条并继续，且不会改成立即发送。其他错误仍会中断；修复后使用“从失败项继续”，已经排期或跳过的任务不会重复执行。

## 打包

发布包是由 `x-native-scheduler-test-plugin/` 目录生成的 zip：

```powershell
Compress-Archive -Path x-native-scheduler-test-plugin -DestinationPath x-native-scheduler-test-plugin.zip -Force
```

zip 属于可重新生成的本地交付物，默认不提交到 Git。

## 验证

提交前至少做一次轻量检查：

```powershell
node --test tests/reply-core.test.cjs tests/timezone-core.test.cjs
node tools/validate-extension.mjs
node --check x-native-scheduler-test-plugin/background.js
node --check x-native-scheduler-test-plugin/content.js
node --check x-native-scheduler-test-plugin/popup.js
```

浏览器端仍需用 1-3 条测试帖做实测，因为 X 前端结构变化可能导致按钮或弹窗识别失效。

## 限制

- 当前测试版支持普通文本、图片和小视频。
- 回复排期第一版仅支持纯文字。
- 回复排期依赖 X 当前页面是否向回复编辑器提供原生排期入口；单条缺少入口时安全跳过并继续。
- 暂不支持 GIF、投票、线程和长文。
- 单个媒体和单次队列总媒体测试限制均为 25MB。
- 扩展不会绕过 X 的登录、安全校验、验证码、风控或平台规则。
