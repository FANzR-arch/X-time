let schedulerWindowId = null;

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

function respondAsync(promise, sendResponse) {
  promise
    .then(() => sendResponse({ ok: true }))
    .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
}
