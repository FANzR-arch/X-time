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

test("uses the runtime IANA timezone catalog with curated city aliases", () => {
  assert.ok(tz.TIMEZONE_OPTIONS.length > 100);
  assert.equal(tz.TIMEZONE_OPTIONS.find(option => option.id === "America/Los_Angeles")?.city, "旧金山");
  assert.ok(tz.TIMEZONE_OPTIONS.some(option => ![
    "Asia/Shanghai", "America/Los_Angeles", "America/New_York", "Europe/London", "Europe/Paris",
    "Asia/Tokyo", "Asia/Singapore", "Asia/Hong_Kong", "Australia/Sydney", "UTC"
  ].includes(option.id)));
  const ids = tz.TIMEZONE_OPTIONS.map(option => option.id);
  assert.deepEqual(ids, [...ids].sort((left, right) => left.localeCompare(right, "en")));
});

test("adaptive first-day scheduling starts today from target-zone now plus ten minutes", () => {
  const now = new Date(2026, 5, 18, 14, 23, 20);
  const start = tz.resolveDefaultAutomaticStart(now, {
    mode: "adaptive",
    dailyStartMinutes: 8 * 60,
    dailyEndMinutes: 23 * 60,
    leadMinutes: 10
  });
  assert.equal(formatWall(start), "2026-06-18 14:34");
});

test("adaptive first-day scheduling rolls to tomorrow after today's window", () => {
  const now = new Date(2026, 5, 18, 22, 55, 0);
  const start = tz.resolveDefaultAutomaticStart(now, {
    mode: "adaptive",
    dailyStartMinutes: 8 * 60,
    dailyEndMinutes: 23 * 60,
    leadMinutes: 10
  });
  assert.equal(formatWall(start), "2026-06-19 08:00");
});

test("fixed first-day scheduling uses today's fixed time or the next day when passed", () => {
  const before = tz.resolveDefaultAutomaticStart(new Date(2026, 5, 18, 7, 0, 0), {
    mode: "fixed",
    dailyStartMinutes: 8 * 60,
    dailyEndMinutes: 23 * 60
  });
  const after = tz.resolveDefaultAutomaticStart(new Date(2026, 5, 18, 9, 0, 0), {
    mode: "fixed",
    dailyStartMinutes: 8 * 60,
    dailyEndMinutes: 23 * 60
  });
  assert.equal(formatWall(before), "2026-06-18 08:00");
  assert.equal(formatWall(after), "2026-06-19 08:00");
});

function formatWall(date) {
  const pad = value => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
