# Skill: X Scheduled Reply Queue Writer

Use this spec when preparing a pure-text reply queue for the local `X Native Scheduler Test Plugin`.

## Output Contract

Return one Markdown document only:

```md
# X 回复队列

timezone: America/Los_Angeles

--- reply ---
id: reply-001
url: https://x.com/example/status/1234567890123456789

第一条回复正文。

--- reply ---
id: reply-002
url: https://x.com/example/status/2234567890123456789
scheduled_at: 2026-06-19 15:30

第二条回复正文。
```

## Rules

- Use `--- reply ---` before every reply.
- Allowed metadata keys are `id`, `url`, and `scheduled_at`.
- `url` and the reply body are required.
- Put a blank line between metadata and the reply body.
- Use an `https://x.com/<user>/status/<numeric-id>` or equivalent `twitter.com` URL.
- `scheduled_at` is optional and uses `YYYY-MM-DD HH:mm` in the declared target timezone.
- The queue `timezone` must match the target timezone selected in the plugin.
- Omit `scheduled_at` when the plugin should assign times automatically.
- Replies are pure text in the first version; do not add `media`, images, video, GIF, polls, or threads.
- Do not add explanations, tables, or code fences outside the queue document.
