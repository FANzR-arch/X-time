importScripts("timezone-core.js", "reply-core.js");

const REPLY_RUN_STATE_KEY = "xns.replyRunState";
const REPLY_NEXT_ALARM = "xns.reply.next";
const REPLY_ALARM_MIN_DELAY_MS = 250;
let schedulerWindowId = null;
let replyDispatchPromise = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return false;

  if (message.type === "xns-focus-tab") {
    respondAsync(focusSenderTab(sender), sendResponse);
    return true;
  }

  if (message.type === "xns-debugger-insert-text") {
    respondAsync(insertTextViaDebugger(sender, message.text), sendResponse);
    return true;
  }

  if (message.type === "xns-start-reply-queue") {
    respondAsync(startReplyQueue(message), sendResponse);
    return true;
  }

  if (message.type === "xns-stop-reply-queue") {
    respondAsync(stopReplyQueue(), sendResponse);
    return true;
  }

  if (message.type === "xns-resume-reply-queue") {
    respondAsync(resumeReplyQueue(message.tabId), sendResponse);
    return true;
  }

  if (message.type === "xns-get-reply-status") {
    respondAsync(getReplyStatus(), sendResponse);
    return true;
  }

  return false;
});

chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL("popup.html");

  if (schedulerWindowId !== null) {
    try {
      await chrome.windows.update(schedulerWindowId, { focused: true });
      return;
    } catch (error) {
      schedulerWindowId = null;
    }
  }

  const created = await chrome.windows.create({
    url,
    type: "popup",
    width: 1040,
    height: 860,
    focused: true
  });
  schedulerWindowId = created.id;
});

chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === schedulerWindowId) schedulerWindowId = null;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  void maybeDispatchReply(tabId, tab).catch((error) => failCurrentReplyFromBackground(error));
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void handleReplyTabRemoved(tabId).catch((error) => failCurrentReplyFromBackground(error));
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === REPLY_NEXT_ALARM) {
    void wakeReplyQueue().catch((error) => failCurrentReplyFromBackground(error));
  }
});

chrome.runtime.onStartup.addListener(() => {
  void recoverReplyQueueAfterWorkerRestart().catch((error) => failCurrentReplyFromBackground(error));
});

chrome.runtime.onInstalled.addListener(() => {
  void recoverReplyQueueAfterWorkerRestart().catch((error) => failCurrentReplyFromBackground(error));
});

async function focusSenderTab(sender) {
  const tab = sender?.tab;
  if (!tab?.id) throw new Error("focus request has no sender tab");
  if (typeof tab.windowId === "number") {
    await chrome.windows.update(tab.windowId, { focused: true });
  }
  await chrome.tabs.update(tab.id, { active: true });
}

async function insertTextViaDebugger(sender, text) {
  const tab = sender?.tab;
  if (!tab?.id) throw new Error("debugger insert request has no sender tab");

  const target = { tabId: tab.id };
  await chrome.debugger.attach(target, "1.3");
  try {
    await chrome.debugger.sendCommand(target, "Input.insertText", {
      text: String(text || "")
    });
  } finally {
    await chrome.debugger.detach(target).catch(() => {});
  }
}

async function startReplyQueue(message) {
  const tabId = Number(message.tabId);
  if (!Number.isInteger(tabId)) throw new Error("回复队列缺少目标 X 标签页。");
  const existing = await readReplyState();
  const sentCount = existing?.items?.filter((item) => item.status === "sent").length || 0;
  if (existing?.status === "running") {
    throw new Error("已有定时回复正在等待或发送，请先停止当前队列。");
  }
  if (["failed", "stopped"].includes(existing?.status) && sentCount > 0) {
    throw new Error(`已有 ${sentCount} 条回复已发送，请恢复未发送任务，避免重复回复。`);
  }
  await chrome.alarms.clear(REPLY_NEXT_ALARM);
  let state = XnsReply.createReplyRunState(message.items || [], {
    tabId,
    delayMs: message.delayMs,
    now: Date.now()
  });
  state = await persistReplyState(
    state,
    `已保存 ${state.items.length} 条定时回复，等待最近任务时间。`,
    `SCHEDULE ${state.items.length}`
  );
  await scheduleNextReply(state);
  return { ok: true, state };
}

async function stopReplyQueue() {
  const state = await readReplyState();
  if (!state || !["running", "failed"].includes(state.status)) {
    return { ok: true, state };
  }
  await chrome.alarms.clear(REPLY_NEXT_ALARM);
  const stopped = XnsReply.markReplyStopped(state);
  const next = await persistReplyState(stopped, stopped.message, "STOPPED");
  if (state.items?.some((item) => item.status === "processing") && Number.isInteger(next.tabId)) {
    await chrome.tabs.sendMessage(next.tabId, { type: "xns-stop-reply-item" }).catch(() => {});
  }
  return { ok: true, state: next };
}

async function resumeReplyQueue(tabId) {
  const state = await readReplyState();
  if (!state) throw new Error("没有可恢复的回复队列。");
  if (state.status === "done") return { ok: true, state };
  const resumed = XnsReply.resumeReplyRunState({
    ...state,
    activeItemId: null,
    tabId: Number.isInteger(Number(tabId)) ? Number(tabId) : state.tabId
  });
  const next = await persistReplyState(
    resumed,
    `已恢复回复排期，等待第 ${resumed.currentIndex + 1} 条任务。`,
    `RESUME ${resumed.currentIndex + 1}`
  );
  await scheduleNextReply(next);
  return { ok: true, state: next };
}

async function getReplyStatus() {
  return { ok: true, state: await readReplyState() };
}

async function scheduleNextReply(providedState = null, minimumDelayMs = REPLY_ALARM_MIN_DELAY_MS) {
  const state = providedState || await readReplyState();
  if (!state || state.status !== "running") return;
  const item = state.items[state.currentIndex];
  if (!item) {
    await persistReplyState({ ...state, status: "done" }, "回复排期队列已完成。", "DONE");
    return;
  }
  const alarmAt = XnsReply.nextReplyAlarmAt(state, Date.now(), minimumDelayMs);
  if (!Number.isFinite(alarmAt)) return;
  await chrome.alarms.clear(REPLY_NEXT_ALARM);
  await chrome.alarms.create(REPLY_NEXT_ALARM, { when: alarmAt });
  const targetTime = item.targetTimezone
    ? `${XnsTimezone.formatEpochInZone(item.dateMs, item.targetTimezone)} · ${item.targetTimezone}`
    : new Date(item.dateMs).toLocaleString();
  await persistReplyState(
    state,
    `下一条回复将在 ${targetTime} 触发。`,
    `ALARM ${item.id} ${new Date(alarmAt).toISOString()}`
  );
}

async function wakeReplyQueue() {
  const state = await readReplyState();
  if (!state || state.status !== "running") return;
  const item = state.items[state.currentIndex];
  if (!item) {
    await persistReplyState({ ...state, status: "done" }, "回复排期队列已完成。", "DONE");
    return;
  }
  if (Number(item.dateMs) > Date.now() + REPLY_ALARM_MIN_DELAY_MS) {
    await scheduleNextReply(state);
    return;
  }
  await navigateToDueReply(state, item);
}

async function navigateToDueReply(state, item) {
  const tab = await getOrCreateReplyTab(state.tabId, item.targetUrl);
  const next = await persistReplyState(
    { ...state, tabId: tab.id, activeItemId: item.id },
    `到达发送时间，正在打开 ${state.currentIndex + 1}/${state.items.length} 的目标帖子。`,
    `OPEN ${item.id} ${item.targetUrl}`
  );
  const updated = await chrome.tabs.update(tab.id, { url: item.targetUrl, active: true });
  if (updated?.status === "complete" && tabMatchesReply(updated, item)) {
    await maybeDispatchReply(tab.id, updated);
  }
  return next;
}

async function getOrCreateReplyTab(preferredTabId, targetUrl) {
  if (Number.isInteger(preferredTabId)) {
    try {
      const preferred = await chrome.tabs.get(preferredTabId);
      if (isXUrl(preferred.url)) return preferred;
    } catch (_error) {
      // Fall through to another logged-in X tab.
    }
  }
  const matches = await chrome.tabs.query({ url: ["https://x.com/*", "https://twitter.com/*"] });
  if (matches.length) return matches[0];
  return chrome.tabs.create({ url: targetUrl, active: true });
}

function isXUrl(rawUrl) {
  try {
    const host = new URL(rawUrl || "").hostname.toLowerCase().replace(/^www\./, "");
    return host === "x.com" || host === "twitter.com";
  } catch (_error) {
    return false;
  }
}

async function maybeDispatchReply(tabId, tab) {
  const state = await readReplyState();
  if (!state || state.status !== "running" || state.tabId !== tabId) return;
  const item = state.items[state.currentIndex];
  if (!item || item.status !== "pending" || state.activeItemId !== item.id || Number(item.dateMs) > Date.now() + 1000) return;
  if (!tabMatchesReply(tab, item)) {
    const failed = XnsReply.markReplyFailed(
      state,
      item.id,
      `目标帖子打开后被重定向到 ${tab.url || "未知页面"}，请检查登录和访问权限。`
    );
    await persistReplyState(
      { ...failed, activeItemId: null },
      "定时回复发送失败：未能停留在目标帖子页面。",
      `ERROR ${item.id} TARGET_REDIRECT`
    );
    return;
  }
  if (replyDispatchPromise) return;
  replyDispatchPromise = processCurrentReply(state, item, tabId)
    .catch(async (error) => {
      const latest = await readReplyState();
      if (!latest) return;
      if (latest.status === "stopped" && (error.code === "REPLY_STOPPED" || /用户已停止/.test(error.message || ""))) {
        await persistReplyState(latest, "回复排期已停止，当前回复未发送。", `STOPPED ${item.id}`);
        return;
      }
      const failed = XnsReply.markReplyFailed(latest, item.id, error);
      await persistReplyState(
        { ...failed, activeItemId: null },
        `定时回复发送失败：${error.message || String(error)}`,
        `ERROR ${item.id} ${error.message || String(error)}`
      );
    })
    .finally(() => {
      replyDispatchPromise = null;
    });
  await replyDispatchPromise;
}

async function processCurrentReply(state, item, tabId) {
  const processing = XnsReply.markReplyProcessing(state, item.id);
  await persistReplyState(processing, `正在发送 ${processing.currentIndex + 1}/${processing.items.length}：${item.id}`, `SEND ${item.id}`);
  await ensureContentScriptInTab(tabId);
  const response = await chrome.tabs.sendMessage(tabId, {
    type: "xns-send-reply-now",
    item: {
      id: item.id,
      text: item.text,
      targetUrl: item.targetUrl,
      targetStatusId: item.targetStatusId
    }
  });
  if (!response?.ok || response.status !== "sent") {
    const error = new Error(response?.error || "X 页面没有确认回复已发送。");
    error.code = response?.code || "REPLY_SEND_FAILED";
    throw error;
  }

  const latest = await readReplyState();
  if (!latest) throw new Error("回复队列状态丢失。");
  let advanced = { ...XnsReply.markReplySent(latest, item.id, Date.now()), activeItemId: null };
  const wasStopped = latest.status === "stopped";
  if (wasStopped && advanced.status !== "done") advanced = { ...advanced, status: "stopped" };
  advanced = await persistReplyState(
    advanced,
    advanced.status === "done"
      ? "定时回复队列已全部发送。"
      : wasStopped
        ? "当前回复已发送，后续排期保持停止。"
        : `已发送 ${advanced.currentIndex}/${advanced.items.length} 条，等待下一条。`,
    `SENT ${item.id}`
  );
  if (advanced.status === "running") {
    await scheduleNextReply(advanced, advanced.delayMs);
  }
}

async function ensureContentScriptInTab(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: "xns-get-status" });
    if (response?.ok) return;
  } catch (_error) {
    // Inject below when the declared content script has not responded yet.
  }
  await chrome.scripting.executeScript({ target: { tabId }, files: ["reply-core.js", "content.js"] });
}

function tabMatchesReply(tab, item) {
  try {
    const url = new URL(tab.url || "");
    return /^(?:x|twitter)\.com$/i.test(url.hostname.replace(/^www\./, ""))
      && url.pathname.includes(`/status/${item.targetStatusId}`);
  } catch (_error) {
    return false;
  }
}

async function handleReplyTabRemoved(tabId) {
  const state = await readReplyState();
  if (!state || state.tabId !== tabId) return;
  const item = state.items[state.currentIndex];
  if (item?.status === "processing") {
    const failed = XnsReply.recoverInterruptedReplyRunState(state);
    await persistReplyState(
      { ...failed, tabId: null },
      "发送时目标标签页被关闭，结果未知。请检查后再恢复。",
      `ERROR ${item.id} TAB_CLOSED`
    );
    return;
  }
  const next = await persistReplyState({ ...state, tabId: null, activeItemId: null }, state.message, "TAB_CLOSED");
  if (next.status === "running") await scheduleNextReply(next);
}

async function recoverReplyQueueAfterWorkerRestart() {
  let state = await readReplyState();
  if (!state) return;
  const recovered = XnsReply.recoverInterruptedReplyRunState(state);
  if (recovered !== state) {
    state = await persistReplyState(
      recovered,
      "浏览器或扩展在发送过程中重启，结果未知。请检查目标帖子后再恢复。",
      "RECOVER_UNKNOWN"
    );
  }
  if (state.status === "running") await scheduleNextReply(state);
}

async function failCurrentReplyFromBackground(error) {
  const state = await readReplyState().catch(() => null);
  if (!state || state.status !== "running") return;
  const item = state.items[state.currentIndex];
  if (!item || !["pending", "processing"].includes(item.status)) return;
  const failed = XnsReply.markReplyFailed(state, item.id, error);
  await persistReplyState(
    { ...failed, activeItemId: null },
    `定时回复后台执行失败：${error.message || String(error)}`,
    `ERROR ${item.id} BACKGROUND ${error.message || String(error)}`
  );
}

async function readReplyState() {
  const raw = (await chrome.storage.local.get(REPLY_RUN_STATE_KEY))[REPLY_RUN_STATE_KEY] || null;
  const migrated = XnsReply.migrateReplyRunState(raw);
  if (migrated && migrated !== raw) {
    await chrome.storage.local.set({ [REPLY_RUN_STATE_KEY]: migrated });
  }
  return migrated;
}

async function persistReplyState(state, message, logEntry) {
  const next = {
    ...state,
    message: message || state.message || "",
    log: logEntry ? [...(state.log || []), `[${new Date().toLocaleTimeString()}] ${logEntry}`].slice(-120) : (state.log || []),
    updatedAt: Date.now()
  };
  await chrome.storage.local.set({ [REPLY_RUN_STATE_KEY]: next });
  return next;
}

function respondAsync(promise, sendResponse) {
  promise
    .then((result) => sendResponse(result === undefined ? { ok: true } : result))
    .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
}
