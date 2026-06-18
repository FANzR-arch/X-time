# Skill: X Scheduled Post Queue Writer

Use this spec when writing Markdown files for the local `X Native Scheduler Test Plugin`.

## Output Contract

Return one Markdown document only. Do not add explanations outside the Markdown.

The document must use this structure:

```md
# X 发帖队列

timezone: Asia/Shanghai

--- post ---
id: post-001
scheduled_at: 2026-06-16 09:30
media: optional-image.png

帖子正文。

--- post ---
id: post-002

没有 scheduled_at 的帖子会由插件自动补时间。
```

## Required Rules

- Use `--- post ---` as the separator before every post.
- Use stable incremental IDs: `post-001`, `post-002`, `post-003`.
- Put metadata first, then a blank line, then the post body.
- Supported metadata keys:
  - `id`
  - `scheduled_at`
  - `media`
- `scheduled_at` format must be `YYYY-MM-DD HH:mm`, using the timezone declared in the queue header.
- The `timezone` header must match the target timezone selected in the plugin. It does not need to match the browser timezone.
- If the user asks for automatic scheduling, omit `scheduled_at` on those posts.
- `media` is optional. Use exact local filenames only, not paths.
- Multiple images are comma-separated: `media: image-a.png, image-b.jpg`.
- A post may have up to 4 images.
- A post with video may only have 1 video and no other media.
- Keep each media file under 25MB and keep the total media in one plugin run under 25MB.
- Do not include hashtags unless the user explicitly asks.
- Do not include URLs unless the user explicitly provides or asks for them.
- Keep each post under the requested character limit. Default limit is 280 characters.
- If the user gives a time range and interval, assign exact `scheduled_at` values unless they ask the plugin to auto-fill times.

## Time Customization Rules

If the user provides:

- start time
- end time
- interval
- timezone

Then generate timestamps inside that target-timezone window when possible. If the requested number of posts does not fit, continue generating the Markdown; the plugin will automatically continue overflow posts in the next valid daily publishing window.

If the user says "自动排程", omit `scheduled_at` and let the plugin assign times.

When automatic scheduling is requested, the plugin defaults to the target timezone's daily `08:00-23:00` window. Its adaptive first-day mode can begin today at target-zone now plus 10 minutes; fixed first-day mode uses the configured daily start and rolls to tomorrow after that time has passed. It distributes posts evenly and can optionally add random jitter only to plugin-generated times.

## Media Rules

When media is requested, use filenames that the user can select in the plugin media library.

Example:

```md
media: launch-cover.png
```

Do not invent file paths such as `C:\...`. Use filenames only.

## Final Markdown Example

```md
# X 发帖队列

timezone: Asia/Shanghai

--- post ---
id: post-001
scheduled_at: 2026-06-16 09:30
media: launch-cover.png

第一条正文。

--- post ---
id: post-002
scheduled_at: 2026-06-16 11:00

第二条正文。
```
