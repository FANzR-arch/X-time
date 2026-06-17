# X 发帖队列

timezone: Asia/Shanghai

--- post ---
id: post-001
scheduled_at: 2026-06-16 09:30
media: sample-image.png

测试帖 1：这是带图片的模拟内容。成功后，它应该出现在 X 原生 Scheduled / Unsent Posts 列表里。

--- post ---
id: post-002
scheduled_at: 2026-06-16 11:00

测试帖 2：这是纯文本模拟内容。视频格式请参考 simulated_x_post_queue_with_video.md。

--- post ---
id: post-003

测试帖 3：这条没有指定发布时间。使用 smart 模式时，插件会按开始时间和间隔自动补齐。

--- post ---
id: post-004

测试帖 4：这是纯文本模拟内容，用来验证没有媒体时的排程流程。
