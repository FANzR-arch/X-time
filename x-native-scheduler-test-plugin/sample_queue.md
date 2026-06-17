# X 发帖队列模板

timezone: Asia/Shanghai

--- post ---
id: post-001
scheduled_at: 2026-06-16 09:30
media: launch-cover.png

第一条帖子正文。这里可以写多行，但不要在正文中使用独立一行的 --- post ---。

--- post ---
id: post-002

第二条帖子正文。没有 scheduled_at 时，插件会按当前排期规则自动补齐。

--- post ---
id: post-003
scheduled_at: 2026-06-16 14:00
media: product-shot.png, chart.png

第三条帖子正文。多张图片用英文逗号分隔，文件名需要和媒体素材中的本地文件名一致。
