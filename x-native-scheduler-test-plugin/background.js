importScripts("reply-core.js");

const REPLY_RUN_STATE_KEY = "xns.replyRunState";
const REPLY_NEXT_ALARM = "xns.reply.next";
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
  void maybeDispatchReply(tabId, tab);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void failReplyRunForClosedTab(tabId);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === REPLY_NEXT_ALARM) void navigateToCurrentReply();
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
  await chrome.alarms.clear(REPLY_NEXT_ALARM);
  let state = XnsReply.createReplyRunState(message.items || [], {
    tabId,
    delayMs: message.delayMs,
    now: Date.now()
  });
  state = await persistReplyState(state, `开始回复排期：共 ${state.items.length} 条。`, `START ${state.items.length}`);
  await navigateToCurrentReply(state);
  return { ok: true, state };
}

async function stopReplyQueue() {
  const state = await readReplyState();
  if (!state || !["running", "failed"].includes(state.status)) {
    return { ok: true, state };
  }
  await chrome.alarms.clear(REPLY_NEXT_ALARM);
  const stopping = XnsReply.markReplyStopping(state);
  const next = await persistReplyState(stopping, stopping.message, "STOP_REQUESTED");
  if (Number.isInteger(next.tabId)) {
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
    tabId: Number.isInteger(Number(tabId)) ? Number(tabId) : state.tabId
  });
  const next = await persistReplyState(resumed, `从第 ${resumed.currentIndex + 1} 条恢复回复排期。`, `RESUME ${resumed.currentIndex + 1}`);
  await navigateToCurrentReply(next);
  return { ok: true, state: next };
}

async function getReplyStatus() {
  return { ok: true, state: await readReplyState() };
}

async function navigateToCurrentReply(providedState = null) {
  const state = providedState || await readReplyState();
  if (!state || state.status !== "running") return;
  const item = state.items[state.currentIndex];
  if (!item) {
    await persistReplyState({ ...state, status: "done" }, "回复排期队列已完成。", "DONE");
    return;
  }
  const next = await persistReplyState(state, `正在打开 ${state.currentIndex + 1}/${state.items.length} 的目标帖子。`, `NAVIGATE ${item.id} ${item.targetUrl}`);
  await chrome.tabs.update(next.tabId, { url: item.targetUrl, active: true });
}

async function maybeDispatchReply(tabId, tab) {
  const state = await readReplyState();
  if (!state || state.status !== "running" || state.tabId !== tabId) return;
  const item = state.items[state.currentIndex];
  if (!item || item.status !== "queued" || !tabMatchesReply(tab, item)) return;
  if (replyDispatchPromise) return;
  replyDispatchPromise = processCurrentReply(state, item, tabId)
    .catch(async (error) => {
      const latest = await readReplyState();
      if (!latest) return;
      const failed = XnsReply.markReplyFailed(latest, item.id, error);
      await persistReplyState(failed, `回复排期中断：${error.message || String(error)}`, `ERROR ${item.id} ${error.message || String(error)}`);
    })
    .finally(() => {
      replyDispatchPromise = null;
    });
  await replyDispatchPromise;
}

async function processCurrentReply(state, item, tabId) {
  const processing = XnsReply.markReplyProcessing(state, item.id);
  await persistReplyState(processing, `正在处理 ${processing.currentIndex + 1}/${processing.items.length}：${item.id}`, `PROCESS ${item.id}`);
  await ensureContentScriptInTab(tabId);
  const response = await chrome.tabs.sendMessage(tabId, {
    type: "xns-process-reply",
    item: {
      id: item.id,
      text: item.text,
      targetUrl: item.targetUrl,
      targetStatusId: item.targetStatusId,
      scheduledEpochMs: Number(item.dateMs),
      targetTimezone: item.targetTimezone
    }
  });
  if (!response?.ok || response.status !== "scheduled") {
    const error = new Error(response?.error || "X 页面没有确认回复已排期。");
    error.code = response?.code || "REPLY_SCHEDULE_FAILED";
    throw error;
  }

  const latest = await readReplyState();
  if (!latest) throw new Error("回复队列状态丢失。");
  let advanced = XnsReply.markReplyScheduled(latest, item.id, Date.now());
  const wasStopping = latest.status === "stopping";
  if (wasStopping && advanced.status !== "done") advanced = { ...advanced, status: "stopping" };
  advanced = await persistReplyState(
    advanced,
    advanced.status === "done"
      ? "回复排期队列已完成。"
      : wasStopping
        ? "当前回复已排期，队列已停止。"
        : `已排期 ${advanced.currentIndex}/${advanced.items.length} 条，准备下一条。`,
    `SCHEDULED ${item.id}`
  );
  if (advanced.status === "running") {
    await chrome.alarms.create(REPLY_NEXT_ALARM, { when: Date.now() + advanced.delayMs });
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

async function failReplyRunForClosedTab(tabId) {
  const state = await readReplyState();
  if (!state || state.tabId !== tabId || state.status !== "running") return;
  const item = state.items[state.currentIndex];
  if (!item) return;
  const failed = XnsReply.markReplyFailed(state, item.id, "目标 X 标签页已关闭。");
  await persistReplyState(failed, "回复排期中断：目标 X 标签页已关闭。", `ERROR ${item.id} TAB_CLOSED`);
}

async function readReplyState() {
  return (await chrome.storage.local.get(REPLY_RUN_STATE_KEY))[REPLY_RUN_STATE_KEY] || null;
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
