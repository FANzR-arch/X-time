# Conversation Archive

Thread ID: `019e8dca-9830-7292-a2c4-f15283dd0ee6`

Title: `确认X定时发帖功能`

Original cwd: `C:\Users\Van Phoil\Documents\Codex\2026-06-03\x`

Current archive: `D:\00_Formula\03_Coding\X-time\imported-thread-019e8dca-x-scheduler`

## User Goal

The user wanted a purely local and free way to prepare posts locally and automatically schedule them one by one through X's native scheduled-post interface. The hard constraints were:

- Must run locally on the user's own computer.
- Must be free.
- Must not depend on third-party platforms, services, or APIs.
- Scheduled posts must appear in X native `Scheduled / Unsent Posts`, the same as manual scheduling.

## Key Decision

The agreed solution was local browser automation, not X API automation.

Reasoning captured in the original conversation:

- X's ordinary API posting flow publishes immediately and does not place items into X native Scheduled / Unsent Posts.
- Third-party schedulers violate the user's constraint.
- A local browser automation script can operate the X website's native scheduling flow: open composer, fill content, click the calendar icon, choose date/time, and click Schedule.

The recommended implementation became a local Playwright tool.

## Transcript Summary

### User

Asked whether X has a built-in scheduled-post feature.

### Assistant

Confirmed that X web supports native scheduled posts through the composer calendar icon and that scheduled drafts can be viewed through `Unsent posts`. The answer referenced X help pages:

- https://help.x.com/en/using-twitter/how-to-tweet
- https://help.x.com/en/using-twitter/advanced-tweetdeck-features
- https://help.x.com/en/using-twitter/types-of-tweets

### User

Explained the actual need:

> 我每次都要手动编辑，然后定时发送，我想开发一个插件，可以我在本地，编辑好之后，自动帮我一条条的定好发布时间。必须是我本地的工具，或者插件，不要花钱，不要用其他平台，必须出现在X的原生列表中

### Assistant

First created a local browser extension prototype:

- `outputs\x-native-scheduler-extension\manifest.json`
- `outputs\x-native-scheduler-extension\content.js`
- `outputs\x-native-scheduler-extension\popup.html`
- `outputs\x-native-scheduler-extension\popup.js`
- `outputs\x-native-scheduler-extension\README.md`
- `outputs\x-native-scheduler-extension\sample_posts.csv`

This prototype focused on driving the X web UI from an extension panel.

### User

Restated the constraints and proposed the stronger technical direction:

- Pure local execution.
- No paid tools.
- No third-party platforms, services, or APIs.
- Must appear in X native Scheduled / Unsent Posts.
- In 2026, the only matching approach is browser automation directly operating X web's native schedule feature.
- Recommended core tool: Playwright.
- Prepare content in `posts.json`.
- Save login session once in `auth.json`.
- Read posts, upload media, click the calendar icon, set date/time, and click Schedule.
- Add random delays and keep frequency low.

### Assistant

Switched to the Playwright local script approach and created:

- `outputs\x-native-scheduler-playwright\README.md`
- `outputs\x-native-scheduler-playwright\package.json`
- `outputs\x-native-scheduler-playwright\package-lock.json`
- `outputs\x-native-scheduler-playwright\auth\.gitkeep`
- `outputs\x-native-scheduler-playwright\data\posts.example.json`
- `outputs\x-native-scheduler-playwright\scripts\login.js`
- `outputs\x-native-scheduler-playwright\scripts\schedule-x.js`
- `outputs\x-native-scheduler-playwright.zip`

The tool design:

1. `login.js` opens local Chrome or Edge and saves local Playwright storage state.
2. `schedule-x.js` reads `posts.json`.
3. It sorts and validates scheduled items.
4. It opens X web.
5. It fills post text and optional media.
6. It opens X's native schedule dialog.
7. It sets the requested date and time.
8. It confirms Schedule.

## Validation Report From Original Thread

The original thread reported these checks as completed:

```powershell
npm install
node --check scripts\login.js
node --check scripts\schedule-x.js
npm run schedule -- data\posts.example.json --dry-run
```

The dry run successfully parsed two example future scheduled posts.

## Current Import Notes

Copied into the current workspace:

- Playwright scheduler source, excluding `node_modules`.
- Original Playwright zip.
- Browser extension prototype.
- This conversation archive and README.

The old `node_modules` folder was intentionally not copied. Run `npm install` inside the Playwright folder before using it.
