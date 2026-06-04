# X 发帖队列

timezone: Asia/Shanghai

--- post ---
id: post-001
scheduled_at: 2026-06-08 09:30
media: sample-image.png

第一条测试帖：这条使用文档里规定好的发布时间，并引用一张图片。

--- post ---
id: post-002
scheduled_at: 2026-06-08 11:00

第二条测试帖：这是纯文本测试。视频格式请参考 simulated_x_post_queue_with_video.md。

--- post ---
id: post-003

第三条测试帖：没有 scheduled_at，会在 smart 模式下按开始时间和间隔自动补齐。
