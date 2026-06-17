# X 定时测试插件入口

当前主插件：

```text
D:\00_Formula\03_Coding\X-time\x-native-scheduler-test-plugin
```

打包文件：

```text
D:\00_Formula\03_Coding\X-time\x-native-scheduler-test-plugin.zip
```

## 加载或刷新插件

1. 打开 Edge 或 Chrome。
2. 进入 `edge://extensions` 或 `chrome://extensions`。
3. 打开“开发者模式”。
4. 如果已经加载过旧版，点扩展卡片上的“刷新”；如果没有加载过，点“加载已解压的扩展程序”。
5. 选择：

```text
D:\00_Formula\03_Coding\X-time\x-native-scheduler-test-plugin
```

## 新版测试流程

1. 打开 `https://x.com/home` 并确认已经登录。
2. 点击浏览器工具栏里的插件图标，它会打开完整显示的独立悬浮窗口。
3. 导入这个模拟测试文件：

```text
D:\00_Formula\03_Coding\X-time\simulated_x_post_queue.md
```

4. 如果要测试图片，先在“媒体库”选择：

```text
D:\00_Formula\03_Coding\X-time\test-media\sample-image.png
```

5. 点“预览”。
6. 点“开始”。
7. 如果失败，先看底部“执行日志”，里面会记录目标标签页、页面脚本注入、媒体大小和原始错误。
8. 去 X 的 `Unsent posts / Scheduled` 里确认是否出现。

如果预览时自动排期超过当天发布窗口，插件会顺延到次日发布窗口继续排列，不会再改到当前时间后 10 分钟。

如果要测试视频，把你自己的小 MP4 放到 `test-media`，命名为 `sample-video.mp4`，再导入：

```text
D:\00_Formula\03_Coding\X-time\simulated_x_post_queue_with_video.md
```

扩展测试版限制单个媒体和单次队列总媒体均不超过 25MB。大视频建议用 Playwright CLI 版本。

## 给 AI 的写作规范

复制这个文件给 AI，让它按插件要求生成队列：

```text
D:\00_Formula\03_Coding\X-time\X_POST_QUEUE_FORMAT_SKILL.md
```
