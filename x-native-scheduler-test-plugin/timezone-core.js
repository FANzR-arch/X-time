(function initTimezoneCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.XnsTimezone = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  "use strict";

  const TIMEZONE_OPTIONS = [
    { id: "Asia/Shanghai", city: "北京", aliases: ["上海", "中国", "beijing", "shanghai", "utc+8"] },
    { id: "America/Los_Angeles", city: "旧金山", aliases: ["洛杉矶", "san francisco", "los angeles", "pacific"] },
    { id: "America/New_York", city: "纽约", aliases: ["new york", "eastern"] },
    { id: "Europe/London", city: "伦敦", aliases: ["london", "英国"] },
    { id: "Europe/Paris", city: "巴黎", aliases: ["paris", "法国"] },
    { id: "Asia/Tokyo", city: "东京", aliases: ["tokyo", "日本"] },
    { id: "Asia/Singapore", city: "新加坡", aliases: ["singapore"] },
    { id: "Asia/Hong_Kong", city: "香港", aliases: ["hong kong"] },
    { id: "Australia/Sydney", city: "悉尼", aliases: ["sydney", "澳大利亚"] },
    { id: "UTC", city: "协调世界时", aliases: ["gmt", "utc+0"] }
  ];

  const formatterCache = new Map();

  function assertTimeZone(timeZone) {
    const value = String(timeZone || "").trim();
    if (!value) throw new Error("请选择目标时区。");
    try {
      new Intl.DateTimeFormat("en", { timeZone: value }).format(0);
    } catch (_error) {
      throw new Error(`无效的目标时区：${value}`);
    }
    return value;
  }

  function getPartsFormatter(timeZone) {
    const zone = assertTimeZone(timeZone);
    if (!formatterCache.has(zone)) {
      formatterCache.set(zone, new Intl.DateTimeFormat("en-CA", {
        timeZone: zone,
        calendar: "gregory",
        numberingSystem: "latn",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23"
      }));
    }
    return formatterCache.get(zone);
  }

  function getEpochParts(epochMs, timeZone) {
    const epoch = Number(epochMs);
    if (!Number.isFinite(epoch)) throw new Error("时间戳无效。");
    const values = {};
    for (const part of getPartsFormatter(timeZone).formatToParts(new Date(epoch))) {
      if (part.type !== "literal") values[part.type] = Number(part.value);
    }
    if (values.hour === 24) values.hour = 0;
    return {
      year: values.year,
      month: values.month,
      day: values.day,
      hour: values.hour,
      minute: values.minute,
      second: values.second
    };
  }

  function getWallParts(wallDate) {
    if (!(wallDate instanceof Date) || Number.isNaN(wallDate.getTime())) {
      throw new Error("目标时区时间无效。");
    }
    return {
      year: wallDate.getFullYear(),
      month: wallDate.getMonth() + 1,
      day: wallDate.getDate(),
      hour: wallDate.getHours(),
      minute: wallDate.getMinutes(),
      second: wallDate.getSeconds(),
      millisecond: wallDate.getMilliseconds()
    };
  }

  function getOffsetMinutes(epochMs, timeZone) {
    const epoch = Number(epochMs);
    const parts = getEpochParts(epoch, timeZone);
    const representedAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second
    );
    const epochWithoutMilliseconds = Math.trunc(epoch / 1000) * 1000;
    return Math.round((representedAsUtc - epochWithoutMilliseconds) / 60_000);
  }

  function epochToWallDate(epochMs, timeZone) {
    const epoch = Number(epochMs);
    const parts = getEpochParts(epoch, timeZone);
    return new Date(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
      ((epoch % 1000) + 1000) % 1000
    );
  }

  function wallDateToEpoch(wallDate, timeZone) {
    const zone = assertTimeZone(timeZone);
    const target = getWallParts(wallDate);
    const approximate = Date.UTC(
      target.year,
      target.month - 1,
      target.day,
      target.hour,
      target.minute,
      target.second,
      target.millisecond
    );
    const offsets = new Set();
    for (const hours of [-48, -36, -24, -12, 0, 12, 24, 36, 48]) {
      offsets.add(getOffsetMinutes(approximate + hours * 3_600_000, zone));
    }

    const matches = [];
    for (const offset of offsets) {
      const candidate = approximate - offset * 60_000;
      const actual = getEpochParts(candidate, zone);
      if (sameWallParts(target, actual)) matches.push(candidate);
    }
    const uniqueMatches = [...new Set(matches)].sort((a, b) => a - b);
    if (uniqueMatches.length === 0) {
      throw new Error(`该时区中不存在这个本地时间：${formatWallDate(wallDate)}`);
    }
    if (uniqueMatches.length > 1) {
      throw new Error(`该时区中这个本地时间重复出现：${formatWallDate(wallDate)}`);
    }
    return uniqueMatches[0];
  }

  function sameWallParts(expected, actual) {
    return expected.year === actual.year
      && expected.month === actual.month
      && expected.day === actual.day
      && expected.hour === actual.hour
      && expected.minute === actual.minute
      && expected.second === actual.second;
  }

  function formatEpochInZone(epochMs, timeZone) {
    const parts = getEpochParts(epochMs, timeZone);
    return `${parts.year}-${pad(parts.month)}-${pad(parts.day)} ${pad(parts.hour)}:${pad(parts.minute)}`;
  }

  function formatWallDate(wallDate) {
    const parts = getWallParts(wallDate);
    return `${parts.year}-${pad(parts.month)}-${pad(parts.day)} ${pad(parts.hour)}:${pad(parts.minute)}`;
  }

  function formatZoneLabel(timeZone, epochMs = Date.now()) {
    const zone = assertTimeZone(timeZone);
    const offset = getOffsetMinutes(epochMs, zone);
    const sign = offset < 0 ? "−" : "+";
    const absolute = Math.abs(offset);
    const hours = Math.floor(absolute / 60);
    const minutes = absolute % 60;
    const city = TIMEZONE_OPTIONS.find((option) => option.id === zone)?.city
      || zone.split("/").pop().replaceAll("_", " ");
    return `UTC${sign}${pad(hours)}:${pad(minutes)} · ${city}`;
  }

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  return {
    TIMEZONE_OPTIONS,
    assertTimeZone,
    epochToWallDate,
    wallDateToEpoch,
    formatEpochInZone,
    formatZoneLabel,
    getOffsetMinutes
  };
});
