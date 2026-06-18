# X Reply Scheduling and Target Timezone Implementation Plan

> Implementation amendment: X does not expose native scheduling inside reply composers. The completed implementation persists reply tasks and uses `chrome.alarms` to send them at the target instant. See `../specs/2026-06-18-x-extension-timed-replies-amendment.md`; it supersedes conflicting native-reply-scheduling steps below.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a standalone batch reply scheduler that uses X's native reply scheduling flow and make original/reply schedules run in a user-selected IANA timezone.

**Architecture:** Keep the existing original-post content-script queue intact. Add pure shared modules for timezone conversion and reply parsing/state, let the popup calculate target-zone wall times and absolute instants, and let the background service worker persist and orchestrate reply items across target-page navigations. The content script processes one reply at a time and refuses to click any final action unless it has positively identified X's native scheduled-reply action.

**Tech Stack:** Chrome/Edge Manifest V3, plain JavaScript, `Intl.DateTimeFormat`, `chrome.storage`, `chrome.tabs`, `chrome.alarms`, Node's built-in `node:test`.

---

## File structure

- Create `x-native-scheduler-test-plugin/timezone-core.js`: UMD-style pure timezone conversion and display helpers usable by the popup and Node tests.
- Create `x-native-scheduler-test-plugin/reply-core.js`: UMD-style reply queue parser, URL validation, safe action-label validation, and persistent state transitions.
- Create `tests/timezone-core.test.cjs`: timezone and DST behavior tests.
- Create `tests/reply-core.test.cjs`: reply import and run-state tests.
- Modify `x-native-scheduler-test-plugin/popup.html`: original/reply tabs, timezone selector, reply-only state, and dual-time preview surfaces.
- Modify `x-native-scheduler-test-plugin/popup.js`: target-zone persistence, reply parsing/UI, target-zone scheduling, and background queue commands.
- Modify `x-native-scheduler-test-plugin/background.js`: persistent reply queue orchestration across page navigations.
- Modify `x-native-scheduler-test-plugin/content.js`: one-item scheduled reply capability probe and execution.
- Modify `x-native-scheduler-test-plugin/manifest.json`: load shared scripts and grant `alarms` permission.
- Modify `tools/validate-extension.mjs`: syntax-check the shared files and verify reply resources.
- Create `x-native-scheduler-test-plugin/sample_reply_queue.md`: testable reply queue template.
- Modify `x-native-scheduler-test-plugin/README.md`, root `README.md`, `START_HERE.md`, and `X_POST_QUEUE_FORMAT_SKILL.md`: document target timezone and reply workflow.

### Task 1: Timezone conversion core

**Files:**
- Create: `x-native-scheduler-test-plugin/timezone-core.js`
- Create: `tests/timezone-core.test.cjs`

- [ ] **Step 1: Write failing timezone tests**

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const tz = require("../x-native-scheduler-test-plugin/timezone-core.js");

test("converts Los Angeles summer wall time to the correct instant", () => {
  const wall = new Date(2026, 5, 19, 9, 0);
  assert.equal(tz.wallDateToEpoch(wall, "America/Los_Angeles"), Date.UTC(2026, 5, 19, 16, 0));
});

test("uses the winter Los Angeles offset", () => {
  const wall = new Date(2026, 11, 19, 9, 0);
  assert.equal(tz.wallDateToEpoch(wall, "America/Los_Angeles"), Date.UTC(2026, 11, 19, 17, 0));
});

test("rejects nonexistent DST wall time", () => {
  const wall = new Date(2026, 2, 8, 2, 30);
  assert.throws(() => tz.wallDateToEpoch(wall, "America/Los_Angeles"), /不存在/);
});

test("rejects ambiguous DST wall time", () => {
  const wall = new Date(2026, 10, 1, 1, 30);
  assert.throws(() => tz.wallDateToEpoch(wall, "America/Los_Angeles"), /重复/);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/timezone-core.test.cjs`

Expected: FAIL with `Cannot find module '../x-native-scheduler-test-plugin/timezone-core.js'`.

- [ ] **Step 3: Implement the minimal pure API**

Implement and export this contract:

```js
{
  TIMEZONE_OPTIONS,
  assertTimeZone,
  epochToWallDate,
  wallDateToEpoch,
  formatEpochInZone,
  formatZoneLabel,
  getOffsetMinutes
}
```

`wallDateToEpoch()` must generate possible instants from offsets sampled around the requested wall time, round-trip each candidate through `Intl.DateTimeFormat(..., { timeZone, hourCycle: "h23" })`, and accept exactly one candidate. Zero candidates throws `该时区中不存在这个本地时间`; two candidates throws `该时区中这个本地时间重复出现`.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `node --test tests/timezone-core.test.cjs`

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```powershell
git add x-native-scheduler-test-plugin/timezone-core.js tests/timezone-core.test.cjs
git commit -m "feat: add target timezone conversion core"
```

### Task 2: Reply queue parser and persistent state core

**Files:**
- Create: `x-native-scheduler-test-plugin/reply-core.js`
- Create: `tests/reply-core.test.cjs`

- [ ] **Step 1: Write failing parser/state tests**

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const reply = require("../x-native-scheduler-test-plugin/reply-core.js");

test("parses multiple reply blocks and normalizes twitter URLs", () => {
  const items = reply.parseReplyQueue(`timezone: America/Los_Angeles
--- reply ---
id: r1
url: https://twitter.com/a/status/123?s=20

first
--- reply ---
url: https://x.com/b/status/456
scheduled_at: 2026-06-19 15:30

second`, { targetTimezone: "America/Los_Angeles" });
  assert.equal(items.length, 2);
  assert.equal(items[0].targetUrl, "https://x.com/a/status/123");
  assert.equal(items[1].scheduledAtText, "2026-06-19 15:30");
});

test("rejects timezone mismatch", () => {
  assert.throws(() => reply.parseReplyQueue("timezone: Asia/Shanghai\n--- reply ---\nurl: https://x.com/a/status/1\n\ntext", {
    targetTimezone: "America/Los_Angeles"
  }), /目标时区/);
});

test("resume does not requeue scheduled items", () => {
  const state = reply.createReplyRunState([{ id: "a" }, { id: "b" }]);
  const advanced = reply.markReplyScheduled(state, "a", 1000);
  const failed = reply.markReplyFailed(advanced, "b", "boom");
  const resumed = reply.resumeReplyRunState(failed);
  assert.equal(resumed.items[0].status, "scheduled");
  assert.equal(resumed.items[1].status, "queued");
});

test("only accepts an explicit schedule action label", () => {
  assert.equal(reply.isSafeScheduleAction("Schedule"), true);
  assert.equal(reply.isSafeScheduleAction("定时发送"), true);
  assert.equal(reply.isSafeScheduleAction("Reply"), false);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/reply-core.test.cjs`

Expected: FAIL because `reply-core.js` does not exist.

- [ ] **Step 3: Implement the reply core contract**

Export:

```js
{
  parseReplyQueue,
  normalizeStatusUrl,
  createReplyRunState,
  markReplyProcessing,
  markReplyScheduled,
  markReplyFailed,
  resumeReplyRunState,
  isSafeScheduleAction
}
```

Accept only `https://x.com/<user>/status/<digits>` and `https://twitter.com/<user>/status/<digits>`. Preserve duplicate URLs and return a `warnings` array on the parsed array when duplicates exist.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `node --test tests/reply-core.test.cjs`

Expected: parser, mismatch, resume, and safety tests pass.

- [ ] **Step 5: Commit**

```powershell
git add x-native-scheduler-test-plugin/reply-core.js tests/reply-core.test.cjs
git commit -m "feat: add reply queue parser and state core"
```

### Task 3: Load shared modules and validate extension resources

**Files:**
- Modify: `x-native-scheduler-test-plugin/manifest.json`
- Modify: `x-native-scheduler-test-plugin/popup.html`
- Modify: `x-native-scheduler-test-plugin/background.js`
- Modify: `tools/validate-extension.mjs`

- [ ] **Step 1: Add a failing validator expectation**

Extend `validateJavaScriptSyntax()` to include `timezone-core.js` and `reply-core.js`, and add assertions that popup HTML loads both before `popup.js` and background imports `reply-core.js`.

- [ ] **Step 2: Run validator and verify RED**

Run: `node tools/validate-extension.mjs`

Expected: FAIL because the shared scripts are not yet wired into popup/background.

- [ ] **Step 3: Wire shared scripts**

Add before the module popup script:

```html
<script src="timezone-core.js"></script>
<script src="reply-core.js"></script>
<script type="module" src="popup.js"></script>
```

At the top of `background.js` add:

```js
importScripts("reply-core.js");
```

Add `"alarms"` to manifest permissions. Do not add remote resources.

- [ ] **Step 4: Run validator and syntax checks**

Run: `node tools/validate-extension.mjs`

Expected: `OK extension validation passed`.

- [ ] **Step 5: Commit**

```powershell
git add x-native-scheduler-test-plugin/manifest.json x-native-scheduler-test-plugin/popup.html x-native-scheduler-test-plugin/background.js tools/validate-extension.mjs
git commit -m "chore: load reply scheduling shared modules"
```

### Task 4: Target timezone in the existing scheduling pipeline

**Files:**
- Modify: `x-native-scheduler-test-plugin/popup.html`
- Modify: `x-native-scheduler-test-plugin/popup.js`
- Test: `tests/timezone-core.test.cjs`

- [ ] **Step 1: Add failing pseudo-wall-time tests**

Add tests proving `epochToWallDate()` returns target-zone fields and that converting it back returns the original epoch for Beijing and Los Angeles.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/timezone-core.test.cjs`

Expected: new round-trip assertion fails until the helper is corrected.

- [ ] **Step 3: Add timezone controls and persistence**

Add a searchable `<input id="targetTimezone" list="timezoneOptions">` with curated IANA values. Persist `targetTimezone` in `xns.popup.options`; default to `Asia/Shanghai`. Render the selected option as dynamic `UTC±HH:MM · 城市` plus the IANA identifier.

- [ ] **Step 4: Make `schedulePosts()` use target-zone pseudo wall dates**

Use:

```js
const timezone = getTargetTimezone();
const pseudoNow = XnsTimezone.epochToWallDate(Date.now(), timezone);
```

All daily-window arithmetic continues on pseudo dates. Each scheduled item receives:

```js
const dateMs = XnsTimezone.wallDateToEpoch(date, timezone);
```

Compare `dateMs` with `Date.now()` for future validation. Change imported `timezone` validation to compare with the selected target timezone, not the browser timezone. `prepareOutboundItems()` must send `dateMs` directly.

- [ ] **Step 5: Add dual-time preview**

For every scheduled item, show the pseudo target-zone time and `XnsTimezone.formatEpochInZone(item.dateMs, Intl.DateTimeFormat().resolvedOptions().timeZone)`.

- [ ] **Step 6: Run unit and extension checks**

Run: `node --test tests/timezone-core.test.cjs tests/reply-core.test.cjs`

Run: `node tools/validate-extension.mjs`

Expected: all pass.

- [ ] **Step 7: Commit**

```powershell
git add x-native-scheduler-test-plugin/popup.html x-native-scheduler-test-plugin/popup.js tests/timezone-core.test.cjs
git commit -m "feat: schedule posts in a selected timezone"
```

### Task 5: Independent reply workspace UI

**Files:**
- Modify: `x-native-scheduler-test-plugin/popup.html`
- Modify: `x-native-scheduler-test-plugin/popup.js`
- Create: `x-native-scheduler-test-plugin/sample_reply_queue.md`

- [ ] **Step 1: Add mode controls and reply-only containers**

Add `original` and `reply` workspace buttons. In reply mode:

- source hint text becomes `粘贴多组目标帖子链接和回复内容`;
- queue format uses `--- reply ---`, `url`, and optional `scheduled_at`;
- media library, draft delivery mode, and manual-media controls are hidden;
- preview title becomes `回复预览`.

- [ ] **Step 2: Preserve separate mode state**

Add storage keys:

```js
replySource: "xns.popup.replySource",
replyQueue: "xns.popup.replyQueue",
workspaceMode: "xns.popup.workspaceMode"
```

Switching mode persists the outgoing textarea/queue and restores the incoming mode without merging them.

- [ ] **Step 3: Parse and schedule reply items**

Call `XnsReply.parseReplyQueue(raw, { targetTimezone })`, convert optional `scheduledAtText` to pseudo wall dates, and pass normalized reply posts through the same `schedulePosts()` function. Each result must retain `targetUrl`, `targetStatusId`, `targetTimezone`, and `dateMs`.

- [ ] **Step 4: Render reply cards**

Each card shows the shortened target URL, reply text, schedule source, target-zone time, and browser-local time. Duplicate-link warnings appear above the preview but do not remove items.

- [ ] **Step 5: Add sample template**

Create `sample_reply_queue.md` with two syntactically valid non-live example status URLs and one optional target-zone `scheduled_at` example.

- [ ] **Step 6: Verify UI resources and commit**

Run: `node tools/validate-extension.mjs`

Expected: PASS.

```powershell
git add x-native-scheduler-test-plugin/popup.html x-native-scheduler-test-plugin/popup.js x-native-scheduler-test-plugin/sample_reply_queue.md
git commit -m "feat: add independent batch reply workspace"
```

### Task 6: Persistent background reply orchestrator

**Files:**
- Modify: `x-native-scheduler-test-plugin/background.js`
- Modify: `x-native-scheduler-test-plugin/popup.js`
- Test: `tests/reply-core.test.cjs`

- [ ] **Step 1: Add failing transition tests**

Add tests for `queued -> processing -> scheduled`, `queued -> processing -> failed`, and resume preserving scheduled items.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/reply-core.test.cjs`

Expected: transition tests fail until state functions cover processing and current index.

- [ ] **Step 3: Add background message contract**

Handle:

```text
xns-start-reply-queue
xns-stop-reply-queue
xns-resume-reply-queue
xns-get-reply-status
```

Persist state under `xns.replyRunState`. On start, create state with the supplied `tabId`, items, delay, and `status: "running"`, then navigate to the first `targetUrl`.

- [ ] **Step 4: Orchestrate one item per page load**

On `chrome.tabs.onUpdated` with `status === "complete"`, confirm the tab and status ID match, send `xns-process-reply`, then mark scheduled or failed. Use a named `chrome.alarms` alarm for the inter-item delay before navigating to the next URL.

- [ ] **Step 5: Implement stop and resume**

Stop changes the queue to `stopping` and prevents any next navigation. Resume calls `XnsReply.resumeReplyRunState()`, preserves scheduled items, and starts from the failed/queued item.

- [ ] **Step 6: Wire popup controls**

In reply mode, Start sends outbound reply items to background; Stop and status polling use the reply-specific messages. Original mode continues using `xns-start-queue` in the content script.

- [ ] **Step 7: Run tests/checks and commit**

Run: `node --test tests/reply-core.test.cjs`

Run: `node tools/validate-extension.mjs`

Expected: PASS.

```powershell
git add x-native-scheduler-test-plugin/background.js x-native-scheduler-test-plugin/popup.js tests/reply-core.test.cjs
git commit -m "feat: persist and resume reply scheduling queues"
```

### Task 7: Safe native scheduled-reply execution

**Files:**
- Modify: `x-native-scheduler-test-plugin/content.js`
- Modify: `x-native-scheduler-test-plugin/background.js`
- Test: `tests/reply-core.test.cjs`

- [ ] **Step 1: Add safety tests**

Extend action-label tests with `Post`, `Reply`, `回复`, and empty labels as false; `Schedule`, `定时发送`, `安排`, and `排程` as true.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/reply-core.test.cjs`

Expected: at least one localization assertion fails.

- [ ] **Step 3: Add one-item reply handler**

Handle `xns-process-reply` asynchronously. The implementation must:

```text
validate current status ID
find the target article
click that article's reply button
find the resulting reply composer
fill and round-trip-check text
find schedule action inside that composer only
open and set the native schedule dialog
confirm the dialog
find an explicit safe scheduled action
click it and confirm composer dismissal
```

- [ ] **Step 4: Enforce no-immediate-send invariant**

The final reply method must call `XnsReply.isSafeScheduleAction(label)` and throw `回复编辑器没有可确认的原生排期按钮，已停止且未立即发送` before any final click if it returns false. It must never fall back to a generic enabled `[data-testid="tweetButton"]` for replies.

- [ ] **Step 5: Return structured results**

Successful response:

```js
{ ok: true, status: "scheduled", targetStatusId, scheduledEpochMs }
```

Failure response:

```js
{ ok: false, code: "REPLY_SCHEDULE_UNAVAILABLE", error }
```

- [ ] **Step 6: Run tests and syntax checks**

Run: `node --test tests/reply-core.test.cjs`

Run: `node --check x-native-scheduler-test-plugin/content.js`

Run: `node tools/validate-extension.mjs`

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add x-native-scheduler-test-plugin/content.js x-native-scheduler-test-plugin/background.js tests/reply-core.test.cjs
git commit -m "feat: automate safe native scheduled replies"
```

### Task 8: Documentation, package, and completion audit

**Files:**
- Modify: `x-native-scheduler-test-plugin/README.md`
- Modify: `README.md`
- Modify: `START_HERE.md`
- Modify: `X_POST_QUEUE_FORMAT_SKILL.md`
- Regenerate: `x-native-scheduler-test-plugin.zip`

- [ ] **Step 1: Document the actual workflow**

Document the independent reply tab, `--- reply ---` contract, target timezone semantics, DST behavior, resume behavior, text-only limitation, and the hard stop when X lacks scheduled replies.

- [ ] **Step 2: Run all automated checks**

Run:

```powershell
node --test tests/*.test.cjs
node tools/validate-extension.mjs
node --check x-native-scheduler-test-plugin/background.js
node --check x-native-scheduler-test-plugin/content.js
node --check x-native-scheduler-test-plugin/popup.js
```

Expected: all tests and checks pass with no errors.

- [ ] **Step 3: Regenerate the delivery zip**

Run:

```powershell
Compress-Archive -Path x-native-scheduler-test-plugin -DestinationPath x-native-scheduler-test-plugin.zip -Force
```

Run `node tools/validate-extension.mjs` again; expected: PASS and zip freshness valid.

- [ ] **Step 4: Browser capability smoke test**

Reload the unpacked extension, select a test timezone, import `sample_reply_queue.md` after replacing the example URLs with owned test-post URLs, and verify:

1. no reply is immediately published;
2. the reply composer exposes native Schedule;
3. X's scheduled list contains the reply at the previewed converted time;
4. two different target URLs advance sequentially;
5. an invalid URL stops and resumes without repeating the first scheduled item.

- [ ] **Step 5: Commit documentation and package-source changes**

```powershell
git add x-native-scheduler-test-plugin/README.md README.md START_HERE.md X_POST_QUEUE_FORMAT_SKILL.md
git commit -m "docs: explain reply scheduling and target timezones"
```

- [ ] **Step 6: Completion audit**

Compare every acceptance criterion in `docs/superpowers/specs/2026-06-18-x-reply-scheduling-timezone-design.md` against current files, automated output, and browser smoke-test evidence. Any criterion without direct evidence remains incomplete.
