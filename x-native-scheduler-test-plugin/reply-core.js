(function initReplyCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.XnsReply = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  "use strict";

  function parseReplyQueue(raw, { targetTimezone = "Asia/Shanghai" } = {}) {
    const text = unwrapQueueText(String(raw || "").trim());
    if (!text) return attachQueueMetadata([], "", []);
    const separator = /^---\s*reply\s*---\s*$/gim;
    const firstMatch = separator.exec(text);
    if (!firstMatch) throw new Error("未识别到回复队列，请使用独立一行的 --- reply --- 分隔。");

    const preamble = text.slice(0, firstMatch.index);
    const declaredTimezone = readDeclaredTimezone(preamble);
    if (declaredTimezone && declaredTimezone !== targetTimezone) {
      throw new Error(`队列目标时区为 ${declaredTimezone}，当前选择为 ${targetTimezone}。请切换目标时区后重试。`);
    }

    const chunks = text.split(/^---\s*reply\s*---\s*$/im).slice(1);
    const items = chunks.map((chunk, index) => parseReplyBlock(chunk, index));
    const warnings = duplicateTargetWarnings(items);
    assertUniqueIds(items);
    return attachQueueMetadata(items, declaredTimezone, warnings);
  }

  function unwrapQueueText(raw) {
    const match = String(raw || "").match(/^```(?:md|markdown|text)?\s*\n([\s\S]*?)\n```$/i);
    return match ? match[1].trim() : String(raw || "").trim();
  }

  function readDeclaredTimezone(preamble) {
    return (String(preamble || "").match(/^\s*timezone\s*:\s*([^\s#]+)/im) || [])[1] || "";
  }

  function parseReplyBlock(chunk, index) {
    const lines = String(chunk || "").replace(/\r\n?/g, "\n").trim().split("\n");
    const metadata = {};
    let cursor = 0;
    for (; cursor < lines.length; cursor += 1) {
      const line = lines[cursor];
      if (!line.trim()) {
        cursor += 1;
        break;
      }
      const match = line.match(/^([a-z_]+)\s*:\s*(.*)$/i);
      if (!match) break;
      const key = match[1].toLowerCase();
      if (!new Set(["id", "url", "scheduled_at"]).has(key)) {
        throw new Error(`第 ${index + 1} 条包含不支持的字段：${key}`);
      }
      metadata[key] = match[2].trim();
    }

    const text = lines.slice(cursor).join("\n").trim();
    if (!metadata.url) throw new Error(`第 ${index + 1} 条缺少 url。`);
    if (!text) throw new Error(`第 ${index + 1} 条回复内容为空。`);
    if (metadata.scheduled_at && !/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}$/.test(metadata.scheduled_at)) {
      throw new Error(`第 ${index + 1} 条 scheduled_at 格式无效，请使用 YYYY-MM-DD HH:mm。`);
    }

    const target = normalizeStatusUrl(metadata.url);
    return {
      id: metadata.id || `reply-${String(index + 1).padStart(3, "0")}`,
      targetUrl: target.targetUrl,
      targetStatusId: target.targetStatusId,
      text,
      scheduledAtText: metadata.scheduled_at || ""
    };
  }

  function normalizeStatusUrl(rawUrl) {
    let parsed;
    try {
      parsed = new URL(String(rawUrl || "").trim());
    } catch (_error) {
      throw new Error(`帖子链接无效：${rawUrl || "(空)"}`);
    }
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (!new Set(["x.com", "twitter.com"]).has(host)) {
      throw new Error("帖子链接必须来自 x.com 或 twitter.com。");
    }
    if (parsed.protocol !== "https:") throw new Error("帖子链接必须使用 https。");
    const match = parsed.pathname.match(/^\/([^/]+)\/status\/(\d+)(?:\/)?$/i);
    if (!match) throw new Error("帖子链接必须指向具体的 /<用户>/status/<数字ID> 页面。");
    return {
      targetUrl: `https://x.com/${match[1]}/status/${match[2]}`,
      targetStatusId: match[2]
    };
  }

  function statusIdFromUrl(rawUrl) {
    try {
      const parsed = new URL(String(rawUrl || ""));
      const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
      if (!new Set(["x.com", "twitter.com"]).has(host)) return "";
      return (parsed.pathname.match(/\/status\/(\d+)(?:\/|$)/i) || [])[1] || "";
    } catch (_error) {
      return "";
    }
  }

  function duplicateTargetWarnings(items) {
    const counts = new Map();
    for (const item of items) counts.set(item.targetUrl, (counts.get(item.targetUrl) || 0) + 1);
    return [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([url, count]) => `目标帖子重复 ${count} 次：${url}`);
  }

  function assertUniqueIds(items) {
    const ids = new Set();
    for (const item of items) {
      if (ids.has(item.id)) throw new Error(`回复 id 重复：${item.id}`);
      ids.add(item.id);
    }
  }

  function attachQueueMetadata(items, declaredTimezone, warnings) {
    Object.defineProperties(items, {
      declaredTimezone: { value: declaredTimezone || "", enumerable: false },
      warnings: { value: warnings || [], enumerable: false }
    });
    return items;
  }

  function createReplyRunState(items, { tabId = null, delayMs = 1200, now = Date.now() } = {}) {
    if (!Array.isArray(items) || items.length === 0) throw new Error("没有收到有效的回复队列。");
    return {
      status: "running",
      tabId,
      delayMs: Math.max(600, Number(delayMs || 1200)),
      currentIndex: 0,
      error: "",
      message: "回复队列已创建。",
      log: [],
      createdAt: now,
      updatedAt: now,
      items: items.map((item) => ({
        ...item,
        status: isReplyTerminalStatus(item.status) ? item.status : "queued",
        error: "",
        skipReason: item.status === "skipped" ? String(item.skipReason || "") : "",
        completedAt: item.completedAt || null
      }))
    };
  }

  function markReplyProcessing(state, id, now = Date.now()) {
    return updateItem(state, id, (item) => ({ ...item, status: "processing", error: "" }), {
      status: "running",
      updatedAt: now
    });
  }

  function markReplyScheduled(state, id, completedAt = Date.now()) {
    const next = updateItem(state, id, (item) => ({
      ...item,
      status: "scheduled",
      error: "",
      completedAt
    }), { error: "", updatedAt: completedAt });
    return advanceReplyState(next);
  }

  function markReplySkipped(state, id, reason, completedAt = Date.now()) {
    const next = updateItem(state, id, (item) => ({
      ...item,
      status: "skipped",
      error: "",
      skipReason: String(reason || "回复编辑器没有原生排期按钮。"),
      completedAt
    }), { error: "", updatedAt: completedAt });
    return advanceReplyState(next);
  }

  function advanceReplyState(state) {
    const currentIndex = state.items.findIndex((item) => !isReplyTerminalStatus(item.status));
    return {
      ...state,
      currentIndex: currentIndex < 0 ? state.items.length : currentIndex,
      status: currentIndex < 0 ? "done" : "running"
    };
  }

  function markReplyFailed(state, id, error, now = Date.now()) {
    const message = error?.message || String(error || "回复排期失败");
    const next = updateItem(state, id, (item) => ({ ...item, status: "failed", error: message }), {
      status: "failed",
      error: message,
      updatedAt: now
    });
    return { ...next, currentIndex: next.items.findIndex((item) => item.id === id) };
  }

  function resumeReplyRunState(state, now = Date.now()) {
    const items = state.items.map((item) => (
      item.status === "failed" || item.status === "processing"
        ? { ...item, status: "queued", error: "" }
        : { ...item }
    ));
    const currentIndex = items.findIndex((item) => !isReplyTerminalStatus(item.status));
    return {
      ...state,
      items,
      currentIndex: currentIndex < 0 ? items.length : currentIndex,
      status: currentIndex < 0 ? "done" : "running",
      error: "",
      updatedAt: now
    };
  }

  function markReplyStopping(state, now = Date.now()) {
    return {
      ...state,
      status: "stopping",
      message: "收到停止请求，当前步骤完成后不再继续。",
      updatedAt: now,
      items: state.items.map((item) => ({ ...item }))
    };
  }

  function updateItem(state, id, updater, statePatch) {
    const index = state.items.findIndex((item) => item.id === id);
    if (index < 0) throw new Error(`找不到回复任务：${id}`);
    const items = state.items.map((item, itemIndex) => (itemIndex === index ? updater({ ...item }) : { ...item }));
    return { ...state, ...statePatch, items };
  }

  function isSafeScheduleAction(label) {
    const value = String(label || "").replace(/\s+/g, " ").trim();
    if (!value) return false;
    return /\bschedul(?:e|ed|ing)\b/i.test(value) || /定时|安排|排程/.test(value);
  }

  function isReplyTerminalStatus(status) {
    return status === "scheduled" || status === "skipped";
  }

  return {
    parseReplyQueue,
    normalizeStatusUrl,
    statusIdFromUrl,
    createReplyRunState,
    markReplyProcessing,
    markReplyScheduled,
    markReplySkipped,
    markReplyFailed,
    markReplyStopping,
    resumeReplyRunState,
    isSafeScheduleAction
  };
});
