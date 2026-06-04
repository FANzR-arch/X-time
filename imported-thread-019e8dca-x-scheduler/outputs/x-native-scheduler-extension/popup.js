const statusEl = document.getElementById("status");
const button = document.getElementById("toggle");

button.addEventListener("click", async () => {
  statusEl.textContent = "";
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^https:\/\/(x|twitter)\.com\//.test(tab.url || "")) {
    statusEl.innerHTML = '请先打开 <a href="https://x.com/home" target="_blank">x.com/home</a>。';
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, { type: "xns-toggle-panel" });
    statusEl.textContent = "已发送打开面板指令。";
  } catch (error) {
    statusEl.textContent = "页面脚本未响应，请刷新 x.com 后重试。";
  }
});
