(() => {
  const APP_ID = "xns-root";
  const STORAGE_KEY = "xns.queueText";
  const OPTIONS_KEY = "xns.options";
  const state = {
    running: false,
    stopRequested: false,
    root: null,
    shadow: null,
    log: []
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

  chrome.runtime.onMessage.addListener((message) => {
    if (message && message.type === "xns-toggle-panel") {
      ensurePanel();
      togglePanel();
    }
  });

  ensureLauncher();

  function ensureLauncher() {
    if (document.getElementById("xns-launcher")) return;
    const button = document.createElement("button");
    button.id = "xns-launcher";
    button.textContent = "XQ";
    button.title = "X 原生定时队列";
    Object.assign(button.style, {
      position: "fixed",
      right: "18px",
      bottom: "18px",
      zIndex: "2147483647",
      width: "44px",
      height: "44px",
      border: "0",
      borderRadius: "22px",
      background: "#111820",
      color: "#fff",
      font: "700 13px system-ui, sans-serif",
      cursor: "pointer",
      boxShadow: "0 8px 24px rgba(0,0,0,.22)"
    });
    button.addEventListener("click", () => {
      ensurePanel();
      togglePanel(true);
    });
    document.documentElement.appendChild(button);
  }

  function ensurePanel() {
    if (state.root) return;

    const host = document.createElement("div");
    host.id = APP_ID;
    host.style.position = "fixed";
    host.style.zIndex = "2147483647";
    host.style.right = "18px";
    host.style.bottom = "76px";
    host.style.display = "none";
    document.documentElement.appendChild(host);

    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        * { box-sizing: border-box; }
        .panel {
          width: min(440px, calc(100vw - 28px));
          max-height: min(720px, calc(100vh - 104px));
          overflow: auto;
          border: 1px solid rgba(15, 23, 42, .16);
          border-radius: 10px;
          background: #ffffff;
          color: #17202a;
          box-shadow: 0 18px 50px rgba(0, 0, 0, .24);
          font: 13px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 12px 14px;
          border-bottom: 1px solid #e7e9ea;
        }
        .title {
          margin: 0;
          font-size: 15px;
          font-weight: 750;
        }
        .close {
          width: 30px;
          height: 30px;
          border: 0;
          border-radius: 15px;
          background: #eef1f3;
          color: #17202a;
          cursor: pointer;
          font-size: 18px;
          line-height: 1;
        }
        .body {
          padding: 14px;
          display: grid;
          gap: 10px;
        }
        label {
          display: grid;
          gap: 6px;
          font-weight: 650;
        }
        textarea {
          min-height: 180px;
          resize: vertical;
          border: 1px solid #cfd9de;
          border-radius: 8px;
          padding: 10px;
          color: #17202a;
          background: #fff;
          font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          outline: none;
        }
        textarea:focus, input:focus {
          border-color: #1d9bf0;
          box-shadow: 0 0 0 2px rgba(29, 155, 240, .14);
        }
        .hint {
          color: #536471;
          font-size: 12px;
          margin: -2px 0 0;
        }
        .row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }
        input {
          width: 100%;
          border: 1px solid #cfd9de;
          border-radius: 8px;
          padding: 8px 9px;
          font: inherit;
        }
        .actions {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
        }
        button.action {
          border: 0;
          border-radius: 8px;
          padding: 9px 8px;
          font: 700 12px system-ui, sans-serif;
          cursor: pointer;
        }
        .primary { background: #111820; color: #fff; }
        .secondary { background: #eef1f3; color: #17202a; }
        .danger { background: #fde8e8; color: #b42318; }
        .status {
          min-height: 22px;
          padding: 9px 10px;
          border-radius: 8px;
          background: #f7f9f9;
          color: #536471;
        }
        .log {
          min-height: 70px;
          max-height: 150px;
          overflow: auto;
          border: 1px solid #e7e9ea;
          border-radius: 8px;
          padding: 8px;
          background: #fbfbfd;
          color: #344150;
          font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          white-space: pre-wrap;
        }
      </style>
      <section class="panel" aria-label="X native scheduler queue">
        <div class="header">
          <h2 class="title">X 原生定时队列</h2>
          <button class="close" title="关闭" type="button">×</button>
        </div>
        <div class="body">
          <label>
            队列内容
            <textarea id="queue" spellcheck="false" placeholder="每行一条：2026-06-04 09:30<Tab>帖子内容&#10;也支持 CSV：datetime,text"></textarea>
          </label>
          <p class="hint">时间使用浏览器本地时区。建议先小批量测试 1-3 条，再跑完整队列。</p>
          <div class="row">
            <label>
              操作间隔秒
              <input id="delay" type="number" min="0.6" step="0.1" value="1.2">
            </label>
            <label>
              单帖字数上限
              <input id="maxChars" type="number" min="1" step="1" value="280">
            </label>
          </div>
          <div class="actions">
            <button class="action secondary" id="validate" type="button">校验</button>
            <button class="action secondary" id="save" type="button">保存</button>
            <button class="action primary" id="start" type="button">开始</button>
            <button class="action danger" id="stop" type="button">停止</button>
          </div>
          <div class="status" id="status">等待队列。</div>
          <div class="log" id="log"></div>
        </div>
      </section>
    `;

    state.root = host;
    state.shadow = shadow;

    shadow.querySelector(".close").addEventListener("click", () => togglePanel(false));
    shadow.getElementById("validate").addEventListener("click", validateQueue);
    shadow.getElementById("save").addEventListener("click", savePanelState);
    shadow.getElementById("start").addEventListener("click", startQueue);
    shadow.getElementById("stop").addEventListener("click", stopQueue);

    restorePanelState();
  }

  function togglePanel(forceOpen) {
    const shouldOpen = typeof forceOpen === "boolean" ? forceOpen : state.root.style.display === "none";
    state.root.style.display = shouldOpen ? "block" : "none";
  }

  function els() {
    return {
      queue: state.shadow.getElementById("queue"),
      delay: state.shadow.getElementById("delay"),
      maxChars: state.shadow.getElementById("maxChars"),
      status: state.shadow.getElementById("status"),
      log: state.shadow.getElementById("log")
    };
  }

  async function restorePanelState() {
    const saved = await chrome.storage.local.get([STORAGE_KEY, OPTIONS_KEY]);
    const ui = els();
    if (saved[STORAGE_KEY]) ui.queue.value = saved[STORAGE_KEY];
    if (saved[OPTIONS_KEY]) {
      ui.delay.value = saved[OPTIONS_KEY].delay ?? "1.2";
      ui.maxChars.value = saved[OPTIONS_KEY].maxChars ?? "280";
    }
  }

  async function savePanelState() {
    const ui = els();
    await chrome.storage.local.set({
      [STORAGE_KEY]: ui.queue.value,
      [OPTIONS_KEY]: {
        delay: ui.delay.value,
        maxChars: ui.maxChars.value
      }
    });
    setStatus("已保存到本机浏览器扩展存储。");
  }

  function validateQueue() {
    try {
      const items = getQueueItems();
      setStatus(`校验通过：${items.length} 条。`);
      log(`OK ${items.length} item(s) ready.`);
    } catch (error) {
      setStatus(error.message);
      log(`ERROR ${error.message}`);
    }
  }

  async function startQueue() {
    if (state.running) {
      setStatus("队列正在运行。");
      return;
    }

    let items;
    try {
      items = getQueueItems();
    } catch (error) {
      setStatus(error.message);
      log(`ERROR ${error.message}`);
      return;
    }

    await savePanelState();
    state.running = true;
    state.stopRequested = false;

    const ui = els();
    const delayMs = Math.max(600, Number(ui.delay.value || 1.2) * 1000);
    setStatus(`开始排程：共 ${items.length} 条。请保持当前标签页打开。`);

    try {
      for (let index = 0; index < items.length; index += 1) {
        if (state.stopRequested) break;
        const item = items[index];
        setStatus(`正在处理 ${index + 1}/${items.length}：${formatDateTime(item.date)}`);
        log(`START ${index + 1}/${items.length} ${formatDateTime(item.date)}`);
        await scheduleOne(item);
        log(`DONE ${index + 1}/${items.length}`);
        await sleep(delayMs);
      }
      setStatus(state.stopRequested ? "已停止。请检查 X 定时列表确认已完成部分。" : "队列完成。请打开 X 未发送/定时列表复核。");
    } catch (error) {
      setStatus(`中断：${error.message}`);
      log(`ERROR ${error.message}`);
    } finally {
      state.running = false;
      state.stopRequested = false;
    }
  }

  function stopQueue() {
    state.stopRequested = true;
    setStatus("收到停止请求，当前步骤结束后停止。");
  }

  function getQueueItems() {
    const ui = els();
    const maxChars = Math.max(1, Number(ui.maxChars.value || 280));
    const raw = ui.queue.value.trim();
    if (!raw) throw new Error("队列为空。");
    const rows = parseRows(raw);
    if (!rows.length) throw new Error("没有解析到有效行。");

    const now = Date.now();
    return rows.map((row, index) => {
      const date = parseLocalDateTime(row.datetime);
      const text = String(row.text || "").trim();
      if (!date) throw new Error(`第 ${index + 1} 行时间无效：${row.datetime}`);
      if (date.getTime() <= now + 60_000) throw new Error(`第 ${index + 1} 行时间必须晚于当前时间至少 1 分钟。`);
      if (!text) throw new Error(`第 ${index + 1} 行内容为空。`);
      if (text.length > maxChars) throw new Error(`第 ${index + 1} 行 ${text.length} 字，超过上限 ${maxChars}。`);
      return { date, text };
    });
  }

  function parseRows(raw) {
    const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const first = lines[0] || "";
    if (/datetime/i.test(first) && first.includes(",")) {
      return parseCsv(raw);
    }

    return lines.map((line) => {
      const tabParts = line.split(/\t+/);
      if (tabParts.length >= 2) {
        return { datetime: tabParts[0].trim(), text: tabParts.slice(1).join("\t").trim() };
      }

      const pipeParts = line.split(/\s+\|\s+/);
      if (pipeParts.length >= 2) {
        return { datetime: pipeParts[0].trim(), text: pipeParts.slice(1).join(" | ").trim() };
      }

      const match = line.match(/^(\d{4}-\d{1,2}-\d{1,2}[ T]\d{1,2}:\d{2})\s+(.+)$/);
      if (match) return { datetime: match[1], text: match[2] };
      return { datetime: "", text: line };
    });
  }

  function parseCsv(raw) {
    const matrix = [];
    let row = [];
    let field = "";
    let quoted = false;

    for (let i = 0; i < raw.length; i += 1) {
      const char = raw[i];
      const next = raw[i + 1];
      if (quoted && char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = !quoted;
      } else if (!quoted && char === ",") {
        row.push(field);
        field = "";
      } else if (!quoted && (char === "\n" || char === "\r")) {
        if (char === "\r" && next === "\n") i += 1;
        row.push(field);
        if (row.some((cell) => cell.trim())) matrix.push(row);
        row = [];
        field = "";
      } else {
        field += char;
      }
    }
    row.push(field);
    if (row.some((cell) => cell.trim())) matrix.push(row);
    if (!matrix.length) return [];

    const headers = matrix[0].map((cell) => cell.trim().toLowerCase());
    const datetimeIndex = headers.indexOf("datetime");
    const textIndex = headers.indexOf("text");
    const dateIndex = headers.indexOf("date");
    const timeIndex = headers.indexOf("time");

    if (datetimeIndex < 0 && (dateIndex < 0 || timeIndex < 0)) {
      throw new Error("CSV 需要 datetime,text 或 date,time,text 表头。");
    }
    if (textIndex < 0) throw new Error("CSV 需要 text 表头。");

    return matrix.slice(1).filter((cells) => cells.some((cell) => cell.trim())).map((cells) => ({
      datetime: datetimeIndex >= 0 ? cells[datetimeIndex] : `${cells[dateIndex]} ${cells[timeIndex]}`,
      text: cells[textIndex]
    }));
  }

  function parseLocalDateTime(value) {
    const trimmed = String(value || "").trim();
    const match = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const [, y, m, d, hh, mm] = match.map(Number);
    const date = new Date(y, m - 1, d, hh, mm, 0, 0);
    if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d || date.getHours() !== hh || date.getMinutes() !== mm) {
      return null;
    }
    return date;
  }

  async function scheduleOne(item) {
    await openComposer();
    const editable = await waitFor(findEditable, 15_000, "找不到 X 发帖输入框");
    await fillComposer(editable, item.text);
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
    const existing = normalizedText(editable.innerText || editable.value || "");
    if (existing) throw new Error("当前发帖框已有内容，请先关闭或清空后再运行。");

    editable.focus();
    if (editable.isContentEditable) {
      document.execCommand("insertText", false, text);
      editable.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
    } else {
      setNativeValue(editable, text);
    }
    await waitFor(() => normalizedText(editable.innerText || editable.value || "").length > 0, 5_000, "未能写入帖子内容");
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

  function setStatus(message) {
    ensurePanel();
    els().status.textContent = message;
  }

  function log(message) {
    ensurePanel();
    const stamp = new Date().toLocaleTimeString();
    state.log.push(`[${stamp}] ${message}`);
    state.log = state.log.slice(-80);
    els().log.textContent = state.log.join("\n");
    els().log.scrollTop = els().log.scrollHeight;
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
