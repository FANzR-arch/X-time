(() => {
  if (window.__xnsContentScriptLoaded) return;
  window.__xnsContentScriptLoaded = true;

  const RUN_STATE_KEY = "xns.runState";
  const state = {
    running: false,
    stopRequested: false,
    log: [],
    progress: { current: 0, total: 0 }
  };

  const labelGroups = {
    month: ["month", "月份", "月"],
    day: ["day", "date", "日期", "日"],
    year: ["year", "年份", "年"],
    hour: ["hour", "小时", "时"],
    minute: ["minute", "分钟", "分"],
    ampm: ["am", "pm", "上午", "下午"]
  };

  const monthNames = [
    ["jan", "january"],
    ["feb", "february"],
    ["mar", "march"],
    ["apr", "april"],
    ["may"],
    ["jun", "june"],
    ["jul", "july"],
    ["aug", "august"],
    ["sep", "sept", "september"],
    ["oct", "october"],
    ["nov", "november"],
    ["dec", "december"]
  ];

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || !message.type) return false;

    if (message.type === "xns-start-queue") {
      if (state.running) {
        sendResponse({ ok: false, error: "队列正在运行。" });
        return false;
      }

      startQueue(message.items || [], message.options || {});
      sendResponse({ ok: true });
      return false;
    }

    if (message.type === "xns-stop-queue") {
      state.stopRequested = true;
      publishState("stopping", "收到停止请求，当前步骤结束后停止。");
      sendResponse({ ok: true });
      return false;
    }

    if (message.type === "xns-get-status") {
      sendResponse({
        ok: true,
        running: state.running,
        stopRequested: state.stopRequested,
        progress: state.progress,
        log: state.log
      });
      return false;
    }

    return false;
  });

  async function startQueue(rawItems, rawOptions) {
    let items;
    try {
      items = normalizeIncomingItems(rawItems);
    } catch (error) {
      await publishState("error", error.message);
      return;
    }

    const delayMs = Math.max(600, Number(rawOptions.delayMs || 1200));
    state.running = true;
    state.stopRequested = false;
    state.log = [];
    state.progress = { current: 0, total: items.length };

    await publishState("running", `开始排程：共 ${items.length} 条。`);

    try {
      for (let index = 0; index < items.length; index += 1) {
        if (state.stopRequested) break;
        const item = items[index];
        state.progress = { current: index + 1, total: items.length };
        await addLog(`START ${index + 1}/${items.length} ${formatDateTime(item.date)} ${item.id || ""}`.trim());
        await publishState("running", `正在处理 ${index + 1}/${items.length}：${formatDateTime(item.date)}`);
        await scheduleOne(item);
        await addLog(`DONE ${index + 1}/${items.length}`);
        await sleep(delayMs);
      }

      const wasStopped = state.stopRequested;
      state.running = false;
      state.stopRequested = false;
      await publishState(
        wasStopped ? "stopped" : "done",
        wasStopped ? "已停止。请检查 X 定时列表确认已完成部分。" : "队列完成。请打开 X 未发送/定时列表复核。"
      );
    } catch (error) {
      await addLog(`ERROR ${error.message}`);
      state.running = false;
      state.stopRequested = false;
      await publishState("error", `中断：${error.message}`);
    } finally {
      state.running = false;
      state.stopRequested = false;
    }
  }

  function normalizeIncomingItems(rawItems) {
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      throw new Error("没有收到有效队列。");
    }

    const now = Date.now();
    return rawItems.map((raw, index) => {
      const text = normalizedText(raw.text);
      const dateMs = Number(raw.dateMs);
      const date = new Date(dateMs);
      if (!text) throw new Error(`第 ${index + 1} 条内容为空。`);
      if (!Number.isFinite(dateMs) || Number.isNaN(date.getTime())) throw new Error(`第 ${index + 1} 条时间无效。`);
      if (date.getTime() <= now + 60_000) throw new Error(`第 ${index + 1} 条时间必须晚于当前时间至少 1 分钟。`);
      return {
        id: raw.id || `post-${String(index + 1).padStart(3, "0")}`,
        text,
        date,
        media: normalizeIncomingMedia(raw.media || [], index)
      };
    });
  }

  function normalizeIncomingMedia(rawMedia, index) {
    if (!Array.isArray(rawMedia)) throw new Error(`第 ${index + 1} 条媒体格式无效。`);
    return rawMedia.map((media, mediaIndex) => {
      if (!media || !media.name || !media.dataUrl) {
        throw new Error(`第 ${index + 1} 条第 ${mediaIndex + 1} 个媒体无效。`);
      }
      return {
        name: String(media.name),
        type: String(media.type || "application/octet-stream"),
        size: Number(media.size || 0),
        dataUrl: String(media.dataUrl)
      };
    });
  }

  async function publishState(status, message) {
    const payload = {
      status,
      message,
      running: state.running,
      stopRequested: state.stopRequested,
      progress: state.progress,
      log: state.log.slice(-80),
      updatedAt: Date.now()
    };
    await chrome.storage.local.set({ [RUN_STATE_KEY]: payload });
  }

  async function addLog(message) {
    const stamp = new Date().toLocaleTimeString();
    state.log.push(`[${stamp}] ${message}`);
    state.log = state.log.slice(-80);
    await publishState("running", message);
  }

  async function scheduleOne(item) {
    await openComposer();
    const editable = await waitFor(findEditable, 15_000, "找不到 X 发帖输入框");
    await fillComposer(editable, item.text);
    await attachMedia(editable, item.media);
    await openScheduleDialog(editable);
    await setScheduleDialog(item.date);
    await confirmScheduleDialog();
    await publishScheduledPost(editable);
  }

  async function openComposer() {
    if (findEditable()) return;

    const composeButton = findVisible([
      '[data-testid="SideNav_NewTweet_Button"]',
      'a[href="/compose/post"]',
      'a[href*="/compose/post"]'
    ]);

    if (composeButton) {
      realClick(composeButton);
    } else {
      location.assign(`${location.origin}/compose/post`);
    }
  }

  async function fillComposer(editable, text) {
    await sleep(350);
    const expected = comparableComposerText(text);
    const existing = comparableComposerText(getComposerText(editable));
    if (existing) throw new Error("当前发帖框已有内容，请先关闭或清空后再运行。");

    editable.focus();
    if (editable.isContentEditable) {
      await insertContentEditableText(editable, text, expected);
    } else {
      setNativeValue(editable, text);
    }
    await waitFor(() => comparableComposerText(getComposerText(editable)).length > 0, 5_000, "未能写入帖子内容");
    const actual = comparableComposerText(getComposerText(editable));
    if (actual !== expected) {
      throw new Error(`X composer text incomplete: wrote ${actual.length}/${expected.length} chars. Stopped before scheduling.`);
    }
  }

  async function insertContentEditableText(editable, text, expected) {
    const strategies = [
      () => insertTextViaDebugger(editable, text),
      () => dispatchPasteEvents(editable, text),
      () => insertTextByLines(editable, text)
    ];

    for (let index = 0; index < strategies.length; index += 1) {
      if (index > 0) await clearComposer(editable);
      try {
        await strategies[index]();
        if (await waitForComposerMatch(editable, expected, 2_500)) return;
      } catch (error) {
        await addLog(`COMPOSER_WRITE_FALLBACK ${error.message || String(error)}`);
      }
    }

    throw new Error("X composer did not accept the full multiline text. Stopped before scheduling.");
  }

  async function insertTextViaDebugger(editable, text) {
    focusEditableAtEnd(editable);
    const response = await chrome.runtime.sendMessage({
      type: "xns-debugger-insert-text",
      text
    });
    await sleep(500);
    if (!response?.ok) {
      throw new Error(response?.error || "debugger insertText rejected");
    }
  }

  function dispatchPasteEvents(editable, text) {
    focusEditableAtEnd(editable);
    const transfer = new DataTransfer();
    transfer.setData("text/plain", text);
    transfer.setData("text/html", textToPasteHtml(text));

    try {
      editable.dispatchEvent(new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType: "insertFromPaste",
        data: text,
        dataTransfer: transfer
      }));
    } catch (_error) {
      // Some Chromium builds reject dataTransfer on synthetic InputEvent.
    }

    editable.dispatchEvent(new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: transfer
    }));
  }

  async function insertTextByLines(editable, text) {
    const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n");
    for (let index = 0; index < lines.length; index += 1) {
      if (lines[index]) insertPlainText(editable, lines[index]);
      if (index < lines.length - 1) insertParagraph(editable);
      await sleep(25);
    }
  }

  function insertPlainText(editable, text) {
    focusEditableAtEnd(editable);
    document.execCommand("insertText", false, text);
    dispatchComposerInput(editable, "insertText", text);
  }

  function insertParagraph(editable) {
    focusEditableAtEnd(editable);
    document.execCommand("insertParagraph", false, null);
    dispatchComposerInput(editable, "insertParagraph");
  }

  async function clearComposer(editable) {
    editable.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editable);
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand("delete", false, null);
    selection.removeAllRanges();
    dispatchComposerInput(editable, "deleteContentBackward");
    await sleep(150);
  }

  async function waitForComposerMatch(editable, expected, timeoutMs) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const actual = comparableComposerText(getComposerText(editable));
      if (actual === expected) {
        await sleep(250);
        return comparableComposerText(getComposerText(editable)) === expected;
      }
      await sleep(100);
    }
    return false;
  }

  function focusEditableAtEnd(editable) {
    editable.scrollIntoView({ block: "center", inline: "center" });
    editable.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editable);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function dispatchComposerInput(editable, inputType, data) {
    try {
      const init = { bubbles: true, inputType };
      if (typeof data === "string") init.data = data;
      editable.dispatchEvent(new InputEvent("input", init));
    } catch (_error) {
      editable.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  function getComposerText(editable) {
    return editable.value || editable.innerText || "";
  }

  function textToPasteHtml(text) {
    return String(text || "")
      .replace(/\r\n?/g, "\n")
      .split(/\n{2,}/)
      .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
      .join("");
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char]));
  }

  function comparableComposerText(text) {
    return String(text || "")
      .replace(/\u200b/g, "")
      .replace(/\u00a0/g, " ")
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((line) => line.trimEnd())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  async function attachMedia(editable, mediaItems) {
    if (!mediaItems || !mediaItems.length) return;

    const scope = getComposerScope(editable);
    const fileInput = findFileInput(scope) || findFileInput(document);
    if (!fileInput) {
      throw new Error("找不到 X 的媒体上传 input。X 可能改版，或当前发帖框不支持媒体。");
    }

    const transfer = new DataTransfer();
    for (const media of mediaItems) {
      transfer.items.add(dataUrlToFile(media));
    }

    fileInput.files = transfer.files;
    fileInput.dispatchEvent(new Event("input", { bubbles: true }));
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    await addLog(`MEDIA ${mediaItems.map((media) => media.name).join(", ")}`);
    const totalBytes = mediaItems.reduce((sum, media) => sum + Number(media.size || 0), 0);
    const uploadWaitMs = Math.min(18_000, 4_000 + Math.ceil(totalBytes / 1024 / 1024) * 900);
    await sleep(uploadWaitMs);
  }

  function findFileInput(scope) {
    const selectors = [
      'input[type="file"][data-testid="fileInput"]',
      'input[type="file"][accept*="image"]',
      'input[type="file"][accept*="video"]',
      'input[type="file"]'
    ];
    for (const selector of selectors) {
      const input = scope.querySelector(selector);
      if (input) return input;
    }
    return null;
  }

  function dataUrlToFile(media) {
    const commaIndex = media.dataUrl.indexOf(",");
    if (commaIndex < 0) throw new Error(`媒体数据无效：${media.name}`);
    const meta = media.dataUrl.slice(0, commaIndex);
    const base64 = media.dataUrl.slice(commaIndex + 1);
    const mime = media.type || (meta.match(/^data:([^;]+);base64$/) || [])[1] || "application/octet-stream";
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new File([bytes], media.name, { type: mime, lastModified: Date.now() });
  }

  async function openScheduleDialog(editable) {
    const scope = getComposerScope(editable);
    const scheduleButton = findVisible([
      '[data-testid="scheduleOption"]',
      '[aria-label*="Schedule"]',
      '[aria-label*="schedule"]',
      '[aria-label*="定时"]',
      '[aria-label*="安排"]',
      '[aria-label*="排程"]'
    ], scope) || findButtonByText(["Schedule", "定时", "安排", "排程"], scope);

    if (!scheduleButton) throw new Error("找不到 X 的定时按钮；请确认当前账号/界面支持原生定时。");
    realClick(scheduleButton);
    await waitFor(getActiveDialog, 10_000, "未打开定时设置弹窗");
  }

  async function setScheduleDialog(date) {
    const dialog = await waitFor(getActiveDialog, 10_000, "找不到定时设置弹窗");
    const controls = [...dialog.querySelectorAll("select,input")].filter(isVisible);
    const selects = controls.filter((control) => control.tagName === "SELECT");

    if (selects.length >= 5) {
      setScheduleBySelectOrder(selects, date);
      return;
    }

    const month = findControlByLabel(dialog, labelGroups.month);
    const day = findControlByLabel(dialog, labelGroups.day);
    const year = findControlByLabel(dialog, labelGroups.year);
    const hour = findControlByLabel(dialog, labelGroups.hour);
    const minute = findControlByLabel(dialog, labelGroups.minute);
    const ampm = findControlByLabel(dialog, labelGroups.ampm);

    if (!month || !day || !year || !hour || !minute) {
      throw new Error("无法识别定时弹窗中的日期/时间控件，X 可能改版了。");
    }

    const hour24 = date.getHours();
    const hasAmPm = Boolean(ampm);
    setControlValue(month, date.getMonth() + 1, "month");
    setControlValue(day, date.getDate(), "day");
    setControlValue(year, date.getFullYear(), "year");
    setControlValue(hour, hasAmPm ? to12Hour(hour24) : hour24, "hour");
    setControlValue(minute, date.getMinutes(), "minute");
    if (hasAmPm) setControlValue(ampm, hour24 >= 12 ? "PM" : "AM", "ampm");
  }

  function setScheduleBySelectOrder(selects, date) {
    const hour24 = date.getHours();
    setControlValue(selects[0], date.getMonth() + 1, "month");
    setControlValue(selects[1], date.getDate(), "day");
    setControlValue(selects[2], date.getFullYear(), "year");
    if (selects.length >= 6) {
      setControlValue(selects[3], to12Hour(hour24), "hour");
      setControlValue(selects[4], date.getMinutes(), "minute");
      setControlValue(selects[5], hour24 >= 12 ? "PM" : "AM", "ampm");
    } else {
      setControlValue(selects[3], hour24, "hour");
      setControlValue(selects[4], date.getMinutes(), "minute");
    }
  }

  async function confirmScheduleDialog() {
    const dialog = await waitFor(getActiveDialog, 10_000, "找不到定时确认弹窗");
    const confirm = findVisible([
      '[data-testid="scheduledConfirmationPrimaryAction"]'
    ], dialog) || findButtonByText(["Confirm", "确认", "确定", "完成", "Done"], dialog);
    if (!confirm) throw new Error("找不到定时弹窗的确认按钮。");
    await waitUntilEnabled(confirm, 5_000, "定时确认按钮不可用");
    realClick(confirm);
    await sleep(700);
  }

  async function publishScheduledPost(editable) {
    const scope = getComposerScope(editable);
    const button = await waitFor(() => {
      const candidate = findButtonByText(["Schedule", "定时发送", "安排", "排程"], scope)
        || findVisible(['[data-testid="tweetButton"]', '[data-testid="tweetButtonInline"]'], scope);
      return candidate && !isDisabled(candidate) ? candidate : null;
    }, 10_000, "找不到最终的 Schedule 按钮");

    realClick(button);
    await sleep(2_200);
  }

  function findEditable() {
    const candidates = [
      '[data-testid="tweetTextarea_0"]',
      '[role="textbox"][contenteditable="true"]',
      'div[contenteditable="true"][aria-label]',
      'textarea[aria-label]'
    ];
    return findVisible(candidates);
  }

  function getComposerScope(editable) {
    return editable.closest('[role="dialog"]') || editable.closest("main") || document;
  }

  function getActiveDialog() {
    const dialogs = [...document.querySelectorAll('[role="dialog"]')].filter(isVisible);
    return dialogs[dialogs.length - 1] || null;
  }

  function findVisible(selectors, scope = document) {
    for (const selector of selectors) {
      const match = [...scope.querySelectorAll(selector)].find(isVisible);
      if (match) return match;
    }
    return null;
  }

  function findButtonByText(needles, scope = document) {
    const lowerNeedles = needles.map((needle) => needle.toLowerCase());
    const buttons = [...scope.querySelectorAll('button,[role="button"]')].filter(isVisible);
    return buttons.find((button) => {
      const text = normalizedText(button.innerText || button.getAttribute("aria-label") || "").toLowerCase();
      return lowerNeedles.some((needle) => text === needle.toLowerCase() || text.includes(needle.toLowerCase()));
    }) || null;
  }

  function findControlByLabel(scope, labels) {
    const controls = [...scope.querySelectorAll("select,input")].filter(isVisible);
    const normalizedLabels = labels.map((label) => label.toLowerCase());
    return controls.find((control) => {
      const aria = (control.getAttribute("aria-label") || "").toLowerCase();
      const id = control.id || "";
      const label = id ? scope.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
      const text = `${aria} ${label ? label.innerText : ""}`.toLowerCase();
      return normalizedLabels.some((needle) => text.includes(needle));
    }) || null;
  }

  function setControlValue(control, value, kind) {
    if (control.tagName === "SELECT") {
      const option = findMatchingOption(control, value, kind);
      if (!option) throw new Error(`无法设置 ${kind}=${value}，没有匹配选项。`);
      control.value = option.value;
    } else {
      control.focus();
      setNativeValue(control, String(value).padStart(kind === "minute" ? 2 : 1, "0"));
    }
    control.dispatchEvent(new Event("input", { bubbles: true }));
    control.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function findMatchingOption(select, value, kind) {
    const options = [...select.options];
    const wanted = String(value);
    const padded = wanted.padStart(2, "0");
    const numeric = Number(value);

    return options.find((option) => {
      const haystack = `${option.value} ${option.textContent}`.trim().toLowerCase();
      const digits = haystack.match(/\d+/g)?.map(Number) || [];

      if (kind === "ampm") {
        const isPm = String(value).toUpperCase() === "PM";
        return isPm
          ? /\bpm\b|下午|晚上/.test(haystack)
          : /\bam\b|上午|凌晨|早上/.test(haystack);
      }

      if (kind === "month") {
        const monthIndex = numeric - 1;
        const names = monthNames[monthIndex] || [];
        if (names.some((name) => haystack.includes(name))) return true;
        if (/月/.test(haystack) && digits.includes(numeric)) return true;
      }

      if (haystack === wanted || haystack === padded) return true;
      if (option.value === wanted || option.value === padded) return true;
      return digits.includes(numeric);
    }) || null;
  }

  function setNativeValue(element, value) {
    const proto = Object.getPrototypeOf(element);
    const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
    if (descriptor && descriptor.set) descriptor.set.call(element, value);
    else element.value = value;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function realClick(element) {
    element.scrollIntoView({ block: "center", inline: "center" });
    element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse" }));
    element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    element.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "mouse" }));
    element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    element.click();
  }

  function isVisible(element) {
    if (!element || !(element instanceof Element)) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
  }

  function isDisabled(element) {
    return element.disabled || element.getAttribute("aria-disabled") === "true";
  }

  async function waitUntilEnabled(element, timeoutMs, message) {
    await waitFor(() => !isDisabled(element), timeoutMs, message);
  }

  async function waitFor(fn, timeoutMs, message) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (state.stopRequested) throw new Error("用户已停止队列。");
      const result = fn();
      if (result) return result;
      await sleep(150);
    }
    throw new Error(message);
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function to12Hour(hour24) {
    return hour24 % 12 || 12;
  }

  function normalizedText(text) {
    return String(text || "").replace(/\u200b/g, "").trim();
  }

  function formatDateTime(date) {
    const pad = (number) => String(number).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
})();
