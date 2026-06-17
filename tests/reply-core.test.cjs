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
  assert.equal(items[0].targetStatusId, "123");
  assert.equal(items[1].scheduledAtText, "2026-06-19 15:30");
  assert.equal(items.declaredTimezone, "America/Los_Angeles");
});

test("rejects timezone mismatch", () => {
  assert.throws(() => reply.parseReplyQueue(`timezone: Asia/Shanghai
--- reply ---
url: https://x.com/a/status/1

text`, { targetTimezone: "America/Los_Angeles" }), /目标时区/);
});

test("rejects non-status URLs", () => {
  assert.throws(() => reply.normalizeStatusUrl("https://x.com/home"), /帖子链接/);
  assert.throws(() => reply.normalizeStatusUrl("https://example.com/a/status/1"), /x\.com/);
});

test("keeps duplicate targets and emits a warning", () => {
  const items = reply.parseReplyQueue(`--- reply ---
url: https://x.com/a/status/123

first
--- reply ---
url: https://x.com/a/status/123

second`, { targetTimezone: "Asia/Shanghai" });
  assert.equal(items.length, 2);
  assert.equal(items.warnings.length, 1);
  assert.match(items.warnings[0], /重复/);
});

test("moves a reply through queued, processing, and scheduled", () => {
  const state = reply.createReplyRunState([{ id: "a" }, { id: "b" }]);
  const processing = reply.markReplyProcessing(state, "a");
  assert.equal(processing.items[0].status, "processing");
  const advanced = reply.markReplyScheduled(processing, "a", 1000);
  assert.equal(advanced.items[0].status, "scheduled");
  assert.equal(advanced.items[0].completedAt, 1000);
  assert.equal(advanced.currentIndex, 1);
});

test("resume does not requeue scheduled items", () => {
  const state = reply.createReplyRunState([{ id: "a" }, { id: "b" }]);
  const advanced = reply.markReplyScheduled(state, "a", 1000);
  const failed = reply.markReplyFailed(advanced, "b", "boom");
  const resumed = reply.resumeReplyRunState(failed);
  assert.equal(resumed.status, "running");
  assert.equal(resumed.items[0].status, "scheduled");
  assert.equal(resumed.items[1].status, "queued");
  assert.equal(resumed.currentIndex, 1);
});

test("only accepts explicit schedule action labels", () => {
  for (const label of ["Schedule", "Schedule reply", "定时发送", "安排", "排程"]) {
    assert.equal(reply.isSafeScheduleAction(label), true, label);
  }
  for (const label of ["Post", "Reply", "回复", "Send now", ""]) {
    assert.equal(reply.isSafeScheduleAction(label), false, label);
  }
});
