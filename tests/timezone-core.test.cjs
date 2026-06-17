const test = require("node:test");
const assert = require("node:assert/strict");
const tz = require("../x-native-scheduler-test-plugin/timezone-core.js");

test("converts Los Angeles summer wall time to the correct instant", () => {
  const wall = new Date(2026, 5, 19, 9, 0);
  assert.equal(
    tz.wallDateToEpoch(wall, "America/Los_Angeles"),
    Date.UTC(2026, 5, 19, 16, 0)
  );
});

test("uses the winter Los Angeles offset", () => {
  const wall = new Date(2026, 11, 19, 9, 0);
  assert.equal(
    tz.wallDateToEpoch(wall, "America/Los_Angeles"),
    Date.UTC(2026, 11, 19, 17, 0)
  );
});

test("rejects nonexistent DST wall time", () => {
  const wall = new Date(2026, 2, 8, 2, 30);
  assert.throws(
    () => tz.wallDateToEpoch(wall, "America/Los_Angeles"),
    /不存在/
  );
});

test("rejects ambiguous DST wall time", () => {
  const wall = new Date(2026, 10, 1, 1, 30);
  assert.throws(
    () => tz.wallDateToEpoch(wall, "America/Los_Angeles"),
    /重复/
  );
});

test("round-trips Beijing and Los Angeles wall dates", () => {
  const epoch = Date.UTC(2026, 5, 19, 16, 30);
  for (const zone of ["Asia/Shanghai", "America/Los_Angeles"]) {
    const wall = tz.epochToWallDate(epoch, zone);
    assert.equal(tz.wallDateToEpoch(wall, zone), epoch);
  }
});

test("formats dynamic UTC offset and city", () => {
  const summer = tz.formatZoneLabel("America/Los_Angeles", Date.UTC(2026, 5, 19));
  const winter = tz.formatZoneLabel("America/Los_Angeles", Date.UTC(2026, 11, 19));
  assert.match(summer, /^UTC−07:00 · 旧金山$/);
  assert.match(winter, /^UTC−08:00 · 旧金山$/);
});
