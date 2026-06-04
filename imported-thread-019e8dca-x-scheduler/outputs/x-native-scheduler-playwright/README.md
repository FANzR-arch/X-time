# X Native Scheduler Playwright

纯本地 Playwright 工具，用电脑上的 Chrome/Edge 模拟你手动操作 X 网页版的原生定时发帖流程。

目标：

- 本地运行，不依赖第三方平台、服务或 X API。
- 免费，只使用开源 Playwright 控制本机浏览器。
- 每条帖子都走 X 网页原生流程：发帖框 -> 日历按钮 -> 选择时间 -> Schedule。
- 成功后应出现在 X 原生 `Scheduled / Unsent Posts` 列表里，像手动定时一样管理。

## 当前边界

- 推荐先做普通单条文本帖。
- 默认限制 280 字符。X 网页端长文定时能力不稳定，不建议批量尝试。
- 支持本地媒体路径，但媒体上传依赖 X 当前网页结构，第一次需要小批量测试。
- 不包含绕过登录、验证码、风控或平台规则的逻辑。
- X 网页会改版，选择器可能需要维护。

## 安装

在这个目录打开 PowerShell：

```powershell
cd "C:\Users\Van Phoil\Documents\Codex\2026-06-03\x\outputs\x-native-scheduler-playwright"
npm install
```

这个项目使用 `playwright-core`，默认控制你电脑已安装的 Chrome；如果没有 Chrome，会尝试 Edge。

如果你的浏览器不在默认位置，可以指定：

```powershell
$env:CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"
```

## 第一次登录

```powershell
npm run login
```

脚本会打开浏览器。你手动登录 X，确认能看到主页和发帖按钮，然后回到终端按 Enter。

登录态会保存到：

```text
auth/x-auth.json
```

这个文件包含本地登录 cookie，请不要分享。

## 准备帖子

复制示例文件：

```powershell
Copy-Item data\posts.example.json data\posts.json
```

格式：

```json
[
  {
    "id": "post-001",
    "text": "这里是你的帖子正文...",
    "media": [],
    "scheduled_at": "2026-06-05T14:30:00+08:00"
  }
]
```

带媒体：

```json
[
  {
    "id": "post-001",
    "text": "带图测试",
    "media": ["C:\\Users\\Van Phoil\\Pictures\\image1.jpg"],
    "scheduled_at": "2026-06-05T14:30:00+08:00"
  }
]
```

## 校验

```powershell
npm run schedule -- data\posts.json --dry-run
```

## 执行定时

```powershell
npm run schedule -- data\posts.json
```

脚本会按 `scheduled_at` 从早到晚处理。每成功一条，会把该条写回：

```json
"status": "scheduled"
```

再次运行时会跳过已标记的条目。要强制重跑：

```powershell
npm run schedule -- data\posts.json --include-done
```

## 环境变量

```powershell
$env:X_TIMEZONE="Asia/Shanghai"
$env:X_LOCALE="en-US"
$env:BROWSER_CHANNEL="chrome"
$env:MIN_DELAY_MS="2000"
$env:MAX_DELAY_MS="8000"
$env:SLOW_MO_MS="80"
```

默认强制 `en-US` 是为了让 X 的按钮和日期控件更稳定；定时时区默认 `Asia/Shanghai`。

## 验证结果

跑完后，打开 X 发帖框，进入 `Unsent posts / Scheduled`。能看到这些条目，才算真正成功。

如果脚本提示找不到日历按钮、确认按钮或日期时间控件，说明 X 前端结构已经变化，需要更新 `scripts/schedule-x.js` 里的选择器。
