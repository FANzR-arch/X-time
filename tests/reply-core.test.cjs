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

test("extracts and validates the current status id", () => {
  assert.equal(reply.statusIdFromUrl("https://x.com/a/status/123"), "123");
  assert.equal(reply.statusIdFromUrl("https://twitter.com/a/status/456/photo/1"), "456");
  assert.equal(reply.statusIdFromUrl("https://x.com/home"), "");
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

test("sorts scheduled replies and moves one through pending, processing, and sent", () => {
  const state = reply.createReplyRunState([
    { id: "b", dateMs: 3000 },
    { id: "a", dateMs: 2000 }
  ], { now: 1000 });
  assert.deepEqual(state.items.map((item) => item.id), ["a", "b"]);
  assert.equal(state.items[0].status, "pending");
  const processing = reply.markReplyProcessing(state, "a");
  assert.equal(processing.items[0].status, "processing");
  const advanced = reply.markReplySent(processing, "a", 2500);
  assert.equal(advanced.items[0].status, "sent");
  assert.equal(advanced.items[0].completedAt, 2500);
  assert.equal(advanced.currentIndex, 1);
});

test("resume does not requeue sent items", () => {
  const state = reply.createReplyRunState([
    { id: "a", dateMs: 2000 },
    { id: "b", dateMs: 3000 }
  ], { now: 1000 });
  const advanced = reply.markReplySent(state, "a", 2500);
  const failed = reply.markReplyFailed(advanced, "b", "boom");
  const resumed = reply.resumeReplyRunState(failed);
  assert.equal(resumed.status, "running");
  assert.equal(resumed.items[0].status, "sent");
  assert.equal(resumed.items[1].status, "pending");
  assert.equal(resumed.currentIndex, 1);
});

test("stop preserves sent and pending item states", () => {
  const state = reply.createReplyRunState([
    { id: "a", dateMs: 2000 },
    { id: "b", dateMs: 3000 }
  ], { now: 1000 });
  const advanced = reply.markReplySent(state, "a", 2500);
  const stopped = reply.markReplyStopped(advanced, 2600);
  assert.equal(stopped.status, "stopped");
  assert.equal(stopped.items[0].status, "sent");
  assert.equal(stopped.items[1].status, "pending");
  assert.equal(stopped.updatedAt, 2600);
});

test("computes the next alarm and wakes overdue replies immediately", () => {
  const state = reply.createReplyRunState([
    { id: "a", dateMs: 900 },
    { id: "b", dateMs: 3000 }
  ], { now: 1000 });
  assert.equal(reply.nextReplyAlarmAt(state, 1000, 250), 1250);
  const sent = reply.markReplySent(state, "a", 1100);
  assert.equal(reply.nextReplyAlarmAt(sent, 1200, 250), 3000);
  assert.equal(reply.nextReplyAlarmAt(reply.markReplyStopped(sent), 1200, 250), null);
});

test("recovers an interrupted send as a manual-review failure", () => {
  const state = reply.createReplyRunState([{ id: "a", dateMs: 2000 }], { now: 1000 });
  const processing = reply.markReplyProcessing(state, "a", 1500);
  const recovered = reply.recoverInterruptedReplyRunState(processing, 1600);
  assert.equal(recovered.status, "failed");
  assert.equal(recovered.items[0].status, "failed");
  assert.match(recovered.items[0].error, /结果未知/);
});

test("migrates legacy queued and scheduled reply states", () => {
  const migrated = reply.migrateReplyRunState({
    status: "stopping",
    currentIndex: 0,
    items: [
      { id: "a", status: "scheduled", dateMs: 1000 },
      { id: "b", status: "queued", dateMs: 2000 }
    ]
  });
  assert.equal(migrated.status, "stopped");
  assert.equal(migrated.items[0].status, "sent");
  assert.equal(migrated.items[1].status, "pending");
  assert.equal(migrated.currentIndex, 1);
});

test("only accepts explicit reply action labels", () => {
  for (const label of ["Reply", "Reply now", "回复", "立即回复", "回覆"]) {
    assert.equal(reply.isSafeReplyAction(label), true, label);
  }
  for (const label of ["Post", "Schedule", "Send now", "Delete reply", ""]) {
    assert.equal(reply.isSafeReplyAction(label), false, label);
  }
});
