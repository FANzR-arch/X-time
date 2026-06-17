# X-time

本仓库保存本地 Chrome/Edge 扩展 `X Native Scheduler Test Plugin`，用于把单条或多条 Markdown 帖子队列批量保存为 X 草稿，或排入 X 网页原生定时发布流程。

扩展不调用 X API，不上传到第三方平台，也不保存账号密码。运行时依赖已经登录的 `x.com` 页面，并通过网页原生发帖/定时 UI 完成操作。

## 当前主扩展

```text
x-native-scheduler-test-plugin/
```

主要文件：

- `manifest.json`：扩展权限、内容脚本和后台脚本配置。
- `popup.html` / `popup.js`：独立窗口 UI、队列编辑、AI 队列导入、排期预览和执行入口。
- `content.js`：注入 X 页面后执行发帖、上传媒体和定时设置。
- `background.js`：打开独立扩展窗口、聚焦目标标签页，并在需要时使用 Chrome debugger 文本插入。
- `sample_queue.md`：推荐 Markdown 队列模板。
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
3. 选择“排期发布”或“保存草稿”。选择“保存草稿”时不需要填写排期时间。
4. 手动输入一条帖子，或导入 `.md` / `.txt` 队列文件。
5. 如队列里使用 `media:`，先在“媒体素材”里选择同名本地文件。
6. 点击“预览队列”或“预览草稿”检查内容和媒体匹配。
7. 点击“开始”或“存草稿”，执行日志会记录目标标签页、脚本注入、媒体大小、发送进度和原始错误。
8. 完成后到 X 的 `Unsent posts / Scheduled` 或草稿列表里复核。

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

如果队列文件声明了 `timezone:`，它必须和当前浏览器时区一致；否则插件会拒绝导入，避免跨时区定时静默错位。

## 打包

发布包是由 `x-native-scheduler-test-plugin/` 目录生成的 zip：

```powershell
Compress-Archive -Path x-native-scheduler-test-plugin -DestinationPath x-native-scheduler-test-plugin.zip -Force
```

zip 属于可重新生成的本地交付物，默认不提交到 Git。

## 验证

提交前至少做一次轻量检查：

```powershell
node tools/validate-extension.mjs
node --check x-native-scheduler-test-plugin/background.js
node --check x-native-scheduler-test-plugin/content.js
node --check x-native-scheduler-test-plugin/popup.js
```

浏览器端仍需用 1-3 条测试帖做实测，因为 X 前端结构变化可能导致按钮或弹窗识别失效。

## 限制

- 当前测试版支持普通文本、图片和小视频。
- 暂不支持 GIF、投票、线程和长文。
- 单个媒体和单次队列总媒体测试限制均为 25MB。
- 扩展不会绕过 X 的登录、安全校验、验证码、风控或平台规则。
