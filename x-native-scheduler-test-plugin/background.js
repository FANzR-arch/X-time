let schedulerWindowId = null;

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
