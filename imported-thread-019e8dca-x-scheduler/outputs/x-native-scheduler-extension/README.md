# X Native Scheduler Queue

这是一个本地 Chrome/Edge 扩展原型，用来把本地编辑好的普通文本帖逐条排进 X 的原生定时发布列表。

它不调用 X API，不上传到第三方平台，不保存账号密码。它的工作方式是在你已经登录的 `x.com` 页面里自动点击 X 自己的发帖框、日历按钮、确认按钮和最终的 Schedule 按钮，所以成功后内容应出现在 X 原生 `Unsent posts / Scheduled` 列表里。

## 安装

1. 打开 Chrome 或 Edge。
2. 进入 `chrome://extensions` 或 `edge://extensions`。
3. 打开“开发者模式”。
4. 点击“加载已解压的扩展程序”。
5. 选择这个文件夹：

   `C:\Users\Van Phoil\Documents\Codex\2026-06-03\x\outputs\x-native-scheduler-extension`

## 使用

1. 打开 `https://x.com/home` 并确认已经登录。
2. 点击页面右下角的 `XQ` 圆形按钮，或点击浏览器扩展图标后选择“显示 / 隐藏队列面板”。
3. 在队列里粘贴内容。
4. 点击“校验”。
5. 点击“开始”。
6. 完成后打开 X 发帖框里的 `Unsent posts`，检查定时列表。

推荐格式是每行一条，用 Tab 分隔时间和内容：

```text
2026-06-04 09:30	第一条帖子内容
2026-06-04 12:00	第二条帖子内容
```

也支持 CSV：

```csv
datetime,text
2026-06-04 09:30,"第一条帖子内容"
2026-06-04 12:00,"第二条帖子内容，里面可以有逗号"
```

时间按浏览器本地时区解释。

## 当前限制

- 只支持普通文本帖，默认单帖上限 280 字符。
- 暂不支持图片、视频、GIF、投票、线程和长文。
- 运行时需要保持 x.com 标签页打开。
- X 前端改版后，按钮或弹窗识别可能失效，需要更新选择器。
- 建议先用 1-3 条测试，确认进入 X 原生定时列表后再批量运行。
- 这个扩展不会绕过 X 的安全校验、验证码、登录、风控或平台规则。

## 维护入口

核心逻辑在 `content.js`。如果 X 改了界面，通常需要调整这些位置：

- `openComposer()`
- `openScheduleDialog()`
- `setScheduleDialog()`
- `confirmScheduleDialog()`
- `publishScheduledPost()`
