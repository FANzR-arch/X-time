import "./vendor/emoji-picker-element/index.js";
import zhCnI18n from "./vendor/emoji-picker-element/i18n/zh_CN.js";

const XnsTimezone = globalThis.XnsTimezone;
if (!XnsTimezone) throw new Error("timezone-core.js 未加载。");
const XnsReply = globalThis.XnsReply;
if (!XnsReply) throw new Error("reply-core.js 未加载。");

const STORAGE_KEYS = {
  source: "xns.popup.source",
  replySource: "xns.popup.replySource",
  options: "xns.popup.options",
  queue: "xns.popup.queue",
  replyQueue: "xns.popup.replyQueue",
  workspaceMode: "xns.popup.workspaceMode",
  runState: "xns.runState",
  replyRunState: "xns.replyRunState"
};
const DEFAULT_TIMEZONE_KEY = "xns.preferences.defaultTimezone";

const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
const MAX_RUN_MEDIA_BYTES = 25 * 1024 * 1024;
const PLUGIN_LOGO_HTML = '<img class="x-logo" src="assets/plugin-logo-128.png" alt="" aria-hidden="true">';
const QUEUE_TEMPLATE = `# X 发帖队列

timezone: Asia/Shanghai

--- post ---
id: post-001
scheduled_at: 2026-06-16 09:30
media: launch-cover.png

第一条帖子正文。这里可以写多行，但不要在正文中使用独立一行的 --- post ---。

--- post ---
id: post-002

第二条帖子正文。没有 scheduled_at 时，插件会按当前排期规则自动补齐。
`;
const AI_QUEUE_PROMPT = `请把我接下来给你的主题/素材改写成适合 X 发布的多条帖子，并只输出一个 Markdown 队列文件内容。

必须遵守以下格式：
1. 每条帖子必须用独立一行 --- post --- 分隔。
2. 每条帖子的元数据写在正文前面，可用字段只有 id、scheduled_at、media。
3. scheduled_at 使用 YYYY-MM-DD HH:mm，例如 2026-06-16 09:30；不确定时间就省略，让插件自动排期。
4. media 只写文件名，多个文件用英文逗号分隔；没有媒体就省略。
5. timezone 必须和插件中选择的目标时区一致；scheduled_at 按目标时区解释。
6. 单个媒体文件和单次队列总媒体大小都不要超过 25MB。
7. 元数据和正文之间必须空一行。
8. 正文中不要出现独立一行 --- post ---。
9. 不要输出解释、表格、代码围栏或额外说明，只输出队列正文。

模板：
${QUEUE_TEMPLATE}`;
const REPLY_QUEUE_TEMPLATE = `# X 回复队列

timezone: Asia/Shanghai

--- reply ---
id: reply-001
url: https://x.com/example/status/1234567890123456789

第一条回复正文。

--- reply ---
id: reply-002
url: https://x.com/example/status/2234567890123456789
scheduled_at: 2026-06-19 15:30

第二条回复正文。`;
const AI_REPLY_PROMPT = `请把我接下来提供的多组 X 帖子链接和回复文案整理成批量回复队列，并只输出 Markdown 正文。

规则：
1. 每条回复使用独立一行 --- reply --- 分隔。
2. 元数据只允许 id、url、scheduled_at；url 必填。
3. 元数据和回复正文之间必须空一行，回复正文必填。
4. scheduled_at 使用 YYYY-MM-DD HH:mm，按 timezone 指定的目标时区解释；不确定时间时省略。
5. 不要输出代码围栏、解释或额外说明。

模板：
${REPLY_QUEUE_TEMPLATE}`;

const els = {
  originalMode: document.getElementById("originalMode"),
  replyMode: document.getElementById("replyMode"),
  importQueue: document.getElementById("importQueue"),
  importTextQueue: document.getElementById("importTextQueue"),
  copyAiPrompt: document.getElementById("copyAiPrompt"),
  downloadQueueTemplate: document.getElementById("downloadQueueTemplate"),
  chooseMediaInline: document.getElementById("chooseMediaInline"),
  emojiButton: document.getElementById("emojiButton"),
  emojiPanel: document.getElementById("emojiPanel"),
  emojiPicker: document.getElementById("emojiPicker"),
  clearDraftTop: document.getElementById("clearDraftTop"),
  fileInput: document.getElementById("fileInput"),
  mediaInput: document.getElementById("mediaInput"),
  mediaList: document.getElementById("mediaList"),
  mediaLibraryCard: document.getElementById("mediaLibraryCard"),
  manualMediaPreview: document.getElementById("manualMediaPreview"),
  queueCount: document.getElementById("queueCount"),
  charCount: document.getElementById("charCount"),
  source: document.getElementById("source"),
  deliveryModeInputs: [...document.querySelectorAll('input[name="deliveryMode"]')],
  deliveryModeHint: document.getElementById("deliveryModeHint"),
  deliveryModeGroup: document.getElementById("deliveryModeGroup"),
  manualScheduleGroup: document.getElementById("manualScheduleGroup"),
  timezoneSearch: document.getElementById("timezoneSearch"),
  targetTimezone: document.getElementById("targetTimezone"),
  targetTimezoneLabel: document.getElementById("targetTimezoneLabel"),
  browserTimezoneLabel: document.getElementById("browserTimezoneLabel"),
  saveTimezone: document.getElementById("saveTimezone"),
  savedTimezoneHint: document.getElementById("savedTimezoneHint"),
  scheduleOnlySections: [...document.querySelectorAll(".schedule-only")],
  manualScheduledAt: document.getElementById("manualScheduledAt"),
  scheduleMode: document.getElementById("scheduleMode"),
  firstDayStartMode: document.getElementById("firstDayStartMode"),
  firstDayStartHint: document.getElementById("firstDayStartHint"),
  dailyStartTime: document.getElementById("dailyStartTime"),
  dailyEndTime: document.getElementById("dailyEndTime"),
  startAt: document.getElementById("startAt"),
  endAt: document.getElementById("endAt"),
  scheduleStrategyInputs: [...document.querySelectorAll('input[name="scheduleStrategy"]')],
  fixedIntervalField: document.getElementById("fixedIntervalField"),
  intervalMinutes: document.getElementById("intervalMinutes"),
  jitterEnabled: document.getElementById("jitterEnabled"),
  jitterMinutes: document.getElementById("jitterMinutes"),
  jitterMinutesField: document.getElementById("jitterMinutesField"),
  delaySeconds: document.getElementById("delaySeconds"),
  resetState: document.getElementById("resetState"),
  preview: document.getElementById("preview"),
  resume: document.getElementById("resume"),
  save: document.getElementById("save"),
  start: document.getElementById("start"),
  stop: document.getElementById("stop"),
  openX: document.getElementById("openX"),
  status: document.getElementById("status"),
  queueFormatTitle: document.getElementById("queueFormatTitle"),
  queueFormatMeta: document.getElementById("queueFormatMeta"),
  formatChipPrimary: document.getElementById("formatChipPrimary"),
  formatChipSecondary: document.getElementById("formatChipSecondary"),
  formatChipOptional: document.getElementById("formatChipOptional"),
  previewTitle: document.getElementById("previewTitle"),
  previewList: document.getElementById("previewList"),
  log: document.getElementById("log")
};

let selectedMediaFiles = new Map();
let queuedPosts = [];
let queuedReplies = [];
let replyWarnings = [];
let workspaceMode = "original";
const workspaceSources = { original: "", reply: "" };
let manualMediaRefs = [];
let lastItems = [];
let localLog = [];
let persistTimer = null;
let pastedMediaCounter = 0;
let editingQueueIndex = null;
let previewMediaUrls = [];
let savedDefaultTimezone = "";

init();

async function init() {
  renderTimezoneOptions();
  setDefaultTimes();
  await restoreState();
  applyWorkspaceMode({ persist: false });
  setupEmojiPicker();
  bindEvents();
  renderManualMediaPreview();
  renderMediaList();
  renderQueue({ validateMedia: false, silent: true });
  updateComposerState();
  updateTimezoneSummary();
  updateSavedTimezoneHint();
  updateFirstDayStartHint();
  await renderRunState();
  pollRunState();
}

function bindEvents() {
  els.originalMode.addEventListener("click", () => switchWorkspaceMode("original"));
  els.replyMode.addEventListener("click", () => switchWorkspaceMode("reply"));
  els.importQueue.addEventListener("click", () => els.fileInput.click());
  els.importTextQueue.addEventListener("click", importTextQueue);
  els.copyAiPrompt.addEventListener("click", copyAiPrompt);
  els.downloadQueueTemplate.addEventListener("click", downloadQueueTemplate);
  els.chooseMediaInline.addEventListener("click", () => {
    els.mediaInput.dataset.attachToDraft = "1";
    els.mediaInput.click();
  });
  els.emojiButton.addEventListener("click", (event) => {
    const isOpen = els.emojiPanel.classList.toggle("open");
    if (isOpen) positionEmojiPanel(event.currentTarget);
  });
  els.clearDraftTop.addEventListener("click", () => clearDraft());
  els.fileInput.addEventListener("change", importFile);
  els.mediaInput.addEventListener("change", importMediaFiles);
  els.resetState.addEventListener("click", resetPluginState);
  els.preview.addEventListener("click", previewQueue);
  els.resume.addEventListener("click", resumeReplyQueue);
  els.save.addEventListener("click", saveState);
  els.start.addEventListener("click", startQueue);
  els.stop.addEventListener("click", stopQueue);
  els.openX.addEventListener("click", () => chrome.tabs.create({ url: "https://x.com/home" }));
  els.saveTimezone.addEventListener("click", saveDefaultTimezone);

  els.source.addEventListener("input", () => {
    workspaceSources[workspaceMode] = els.source.value;
    updateComposerState();
    schedulePersistState();
  });
  els.source.addEventListener("paste", handleSourcePaste);
  els.timezoneSearch.addEventListener("input", () => renderTimezoneOptions(els.timezoneSearch.value));

  els.manualScheduledAt.addEventListener("change", () => {
    schedulePersistState();
    updateComposerState();
  });

  const scheduleControls = [
    ...els.deliveryModeInputs,
    els.targetTimezone,
    els.scheduleMode,
    els.firstDayStartMode,
    els.dailyStartTime,
    els.dailyEndTime,
    els.startAt,
    els.endAt,
    els.intervalMinutes,
    els.jitterEnabled,
    els.jitterMinutes,
    els.delaySeconds,
    ...els.scheduleStrategyInputs
  ];
  for (const input of scheduleControls) {
    input.addEventListener("change", () => {
      syncScheduleControls();
      updateTimezoneSummary();
      updateSavedTimezoneHint();
      updateFirstDayStartHint();
      renderQueue({ validateMedia: false, silent: true });
      schedulePersistState();
    });
  }

  els.emojiPicker.addEventListener("emoji-click", event => {
    const unicode = event.detail?.unicode;
    if (!unicode) return;
    insertAtCursor(unicode);
    closeEmojiPanel();
  });

  document.addEventListener("click", event => {
    if (event.target === els.emojiButton || els.emojiPanel.contains(event.target)) return;
    closeEmojiPanel();
  });

  els.manualMediaPreview.addEventListener("click", event => {
    const button = event.target.closest("[data-remove-draft-media]");
    if (!button) return;
    removeDraftMedia(button.dataset.removeDraftMedia);
  });

  els.previewList.addEventListener("click", event => {
    const button = event.target.closest("[data-delete-queue-index]");
    if (button) {
      deleteQueuedPost(Number(button.dataset.deleteQueueIndex));
      return;
    }

    const item = event.target.closest("[data-edit-queue-index]");
    if (!item) return;
    loadQueuedPostForEdit(Number(item.dataset.editQueueIndex));
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (!isReplyMode() && changes[STORAGE_KEYS.runState]) renderRunState(changes[STORAGE_KEYS.runState].newValue);
    if (isReplyMode() && changes[STORAGE_KEYS.replyRunState]) renderRunState(changes[STORAGE_KEYS.replyRunState].newValue);
  });
}

async function restoreState() {
  const saved = await chrome.storage.local.get([
    STORAGE_KEYS.source,
    STORAGE_KEYS.replySource,
    STORAGE_KEYS.options,
    STORAGE_KEYS.queue,
    STORAGE_KEYS.replyQueue,
    STORAGE_KEYS.workspaceMode,
    DEFAULT_TIMEZONE_KEY
  ]);
  workspaceSources.original = saved[STORAGE_KEYS.source] || "";
  workspaceSources.reply = saved[STORAGE_KEYS.replySource] || "";
  workspaceMode = saved[STORAGE_KEYS.workspaceMode] === "reply" ? "reply" : "original";
  els.source.value = workspaceSources[workspaceMode];

  const options = saved[STORAGE_KEYS.options] || {};
  savedDefaultTimezone = getValidTimezoneOrEmpty(saved[DEFAULT_TIMEZONE_KEY]);
  els.targetTimezone.value = savedDefaultTimezone || options.targetTimezone || "Asia/Shanghai";
  setDeliveryMode(options.deliveryMode || "schedule");
  if (options.manualScheduledAt) els.manualScheduledAt.value = toDateTimePlaceholderFormat(options.manualScheduledAt);
  if (options.scheduleMode) els.scheduleMode.value = options.scheduleMode;
  if (options.firstDayStartMode) els.firstDayStartMode.value = options.firstDayStartMode;
  if (options.dailyStartTime) els.dailyStartTime.value = options.dailyStartTime;
  if (options.dailyEndTime) els.dailyEndTime.value = options.dailyEndTime;
  if (options.startAt) els.startAt.value = options.startAt;
  if (options.endAt) els.endAt.value = options.endAt;
  if (options.scheduleStrategy) setScheduleStrategy(options.scheduleStrategy);
  if (options.intervalMinutes) els.intervalMinutes.value = options.intervalMinutes;
  if (options.jitterMinutes) els.jitterMinutes.value = options.jitterMinutes;
  els.jitterEnabled.checked = options.jitterEnabled === true || options.jitterEnabled === "true";
  if (options.delaySeconds) els.delaySeconds.value = options.delaySeconds;
  syncScheduleControls();

  queuedPosts = Array.isArray(saved[STORAGE_KEYS.queue])
    ? saved[STORAGE_KEYS.queue].map(hydratePost).filter(Boolean)
    : [];
  queuedReplies = Array.isArray(saved[STORAGE_KEYS.replyQueue])
    ? saved[STORAGE_KEYS.replyQueue].map(hydratePost).filter(Boolean)
    : [];
}

function setDefaultTimes() {
  setDeliveryMode("schedule");
  els.scheduleMode.value = "smart";
  els.firstDayStartMode.value = "adaptive";
  els.dailyStartTime.value = "08:00";
  els.dailyEndTime.value = "23:00";
  els.startAt.value = "";
  els.endAt.value = "";
  setScheduleStrategy("even");
  els.intervalMinutes.value = "60";
  els.jitterEnabled.checked = false;
  els.jitterMinutes.value = "5";
  els.delaySeconds.value = "1.2";
  els.targetTimezone.value = savedDefaultTimezone || "Asia/Shanghai";
  syncScheduleControls();
}

async function persistState() {
  workspaceSources[workspaceMode] = els.source.value;
  await chrome.storage.local.set({
    [STORAGE_KEYS.source]: workspaceSources.original,
    [STORAGE_KEYS.replySource]: workspaceSources.reply,
    [STORAGE_KEYS.options]: getOptions(),
    [STORAGE_KEYS.queue]: queuedPosts.map(serializePost),
    [STORAGE_KEYS.replyQueue]: queuedReplies.map(serializePost),
    [STORAGE_KEYS.workspaceMode]: workspaceMode
  });
}

function schedulePersistState() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(persistState, 250);
}

async function switchWorkspaceMode(mode) {
  const nextMode = mode === "reply" ? "reply" : "original";
  if (nextMode === workspaceMode) return;
  workspaceSources[workspaceMode] = els.source.value;
  workspaceMode = nextMode;
  els.source.value = workspaceSources[workspaceMode];
  editingQueueIndex = null;
  manualMediaRefs = [];
  applyWorkspaceMode({ persist: false });
  renderManualMediaPreview();
  renderQueue({ validateMedia: false, silent: true });
  updateComposerState();
  await persistState();
  await renderRunState();
}

function applyWorkspaceMode({ persist = true } = {}) {
  const replyMode = isReplyMode();
  els.originalMode.classList.toggle("is-active", !replyMode);
  els.replyMode.classList.toggle("is-active", replyMode);
  for (const element of document.querySelectorAll(".original-only")) {
    element.classList.toggle("mode-hidden", replyMode);
  }
  for (const element of document.querySelectorAll(".reply-only")) {
    element.classList.toggle("mode-hidden", !replyMode);
  }
  if (replyMode) setDeliveryMode("schedule");
  els.source.placeholder = replyMode
    ? "粘贴多组目标帖子链接和回复内容，然后点击「解析粘贴」"
    : "有什么新鲜事？";
  els.queueFormatTitle.textContent = replyMode ? "回复队列格式" : "原创队列格式";
  els.queueFormatMeta.textContent = replyMode ? "链接 + 纯文字回复" : "AI 生成可直接粘贴";
  els.formatChipPrimary.textContent = replyMode ? "--- reply --- 分隔" : "--- post --- 分隔";
  els.formatChipSecondary.textContent = replyMode ? "url 必填" : "元数据后空一行";
  els.formatChipOptional.textContent = replyMode ? "scheduled_at 可选" : "scheduled_at / media 可选";
  els.previewTitle.textContent = replyMode ? "回复预览" : "帖子预览";
  els.importQueue.textContent = replyMode ? "导入回复" : "导入";
  els.importTextQueue.textContent = replyMode ? "解析回复" : "解析粘贴";
  setStatus(replyMode
    ? "导入或粘贴多组目标链接和回复内容，再预览并开始排期。"
    : "撰写帖子后点「保存」加入队列，也可导入文件自动生成。");
  syncScheduleControls();
  if (persist) schedulePersistState();
}

function isReplyMode() {
  return workspaceMode === "reply";
}

function getActiveQueue() {
  return isReplyMode() ? queuedReplies : queuedPosts;
}

function replaceActiveQueue(items) {
  if (isReplyMode()) queuedReplies = items;
  else queuedPosts = items;
}

async function importFile(event) {
  const file = event.target.files && event.target.files[0];
  els.fileInput.value = "";
  if (!file) return;

  try {
    const text = await file.text();
    await importQueueText(text, file.name, formatBytes(file.size));
  } catch (error) {
    addLocalLog(`导入失败：${error.message}`);
    setError(error.message);
  }
}

async function importTextQueue() {
  try {
    await importQueueText(els.source.value, "粘贴内容");
  } catch (error) {
    addLocalLog(`粘贴导入失败：${error.message}`);
    setError(error.message);
  }
}

async function importQueueText(raw, sourceName, sourceDetail = "") {
  if (isReplyMode()) {
    await importReplyQueueText(raw, sourceName, sourceDetail);
    return;
  }
  const declaredTimezone = getDeliveryMode() === "schedule" ? validateDeclaredTimezone(raw) : "";
  const importedPosts = parseSource(raw, { lenientSchedule: getDeliveryMode() === "draft" }).map((post, index) => normalizeImportedPost(post, index));
  if (!importedPosts.length) throw new Error("未识别到任何帖子。请使用独立一行的 --- post --- 分隔多条内容。");
  schedulePosts(importedPosts, { validateMedia: false });

  queuedPosts = importedPosts;
  clearDraft({ silent: true });
  await persistState();
  renderQueue({ validateMedia: false });
  addLocalLog(`已导入 ${sourceName}，识别 ${queuedPosts.length} 条${sourceDetail ? `，${sourceDetail}` : ""}`);

  try {
    schedulePosts(queuedPosts, { validateMedia: true });
    setStatus(getDeliveryMode() === "draft"
      ? `已导入 ${queuedPosts.length} 条帖子，当前会批量保存为草稿。`
      : `已导入 ${queuedPosts.length} 条帖子${declaredTimezone ? `，时区 ${declaredTimezone}` : ""}，可调整排期规则后预览或开始。`);
  } catch (error) {
    setError(error.message);
    addLocalLog(`导入完成，媒体校验提醒：${error.message}`);
  }
}

async function importReplyQueueText(raw, sourceName, sourceDetail = "") {
  const imported = XnsReply.parseReplyQueue(raw, { targetTimezone: getTargetTimezone() });
  if (!imported.length) throw new Error("未识别到任何回复。请使用独立一行的 --- reply --- 分隔多条内容。");
  replyWarnings = [...(imported.warnings || [])];
  const normalized = imported.map((item, index) => normalizeImportedReply(item, index));
  schedulePosts(normalized, { validateMedia: false });
  queuedReplies = normalized;
  clearDraft({ silent: true });
  await persistState();
  renderQueue({ validateMedia: false });
  addLocalLog(`已导入回复队列 ${sourceName}，识别 ${queuedReplies.length} 条${sourceDetail ? `，${sourceDetail}` : ""}`);
  const warningText = replyWarnings.length ? `；${replyWarnings.join("；")}` : "";
  setStatus(`已导入 ${queuedReplies.length} 条回复，目标时区 ${getTargetTimezone()}${warningText}`);
}

async function copyAiPrompt() {
  try {
    await navigator.clipboard.writeText((isReplyMode() ? AI_REPLY_PROMPT : AI_QUEUE_PROMPT).trim());
    addLocalLog(`已复制${isReplyMode() ? "回复" : "原创"}队列提示词。`);
    setStatus(`${isReplyMode() ? "回复" : "原创"}队列提示词已复制。`);
  } catch (error) {
    addLocalLog(`复制提示词失败：${error.message}`);
    setError("无法写入剪贴板，请检查浏览器剪贴板权限。");
  }
}

function downloadQueueTemplate() {
  const blob = new Blob([isReplyMode() ? REPLY_QUEUE_TEMPLATE : QUEUE_TEMPLATE], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = isReplyMode() ? "x-reply-queue-template.md" : "x-post-queue-template.md";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  addLocalLog(`已下载${isReplyMode() ? "回复" : "原创"}队列模板。`);
  setStatus(`${isReplyMode() ? "回复" : "原创"}队列模板已下载。`);
}

function importMediaFiles(event) {
  const files = [...(event.target.files || [])];
  const attachRequested = els.mediaInput.dataset.attachToDraft === "1";
  delete els.mediaInput.dataset.attachToDraft;
  els.mediaInput.value = "";
  if (!files.length) return;

  const shouldAttachToDraft = attachRequested && (
    Boolean(els.source.value.trim()) ||
    manualMediaRefs.length > 0 ||
    editingQueueIndex !== null ||
    queuedPosts.length === 0
  );
  for (const file of files) {
    selectedMediaFiles.set(file.name.toLowerCase(), file);
    if (shouldAttachToDraft && !manualMediaRefs.includes(file.name)) {
      manualMediaRefs.push(file.name);
    }
  }

  renderManualMediaPreview();
  renderMediaList();
  updateComposerState();
  schedulePersistState();
  addLocalLog(`已选择 ${files.length} 个媒体文件，合计 ${formatBytes(files.reduce((sum, file) => sum + file.size, 0))}`);
  setStatus(shouldAttachToDraft ? "媒体已绑定到当前草稿。" : "媒体已加入素材库，可匹配导入文件里的 media 字段。");
}

function handleSourcePaste(event) {
  if (isReplyMode()) return;
  const items = [...(event.clipboardData?.items || [])];
  const imageItem = items.find(item => item.kind === "file" && item.type.startsWith("image/"));
  if (!imageItem) return;

  const file = imageItem.getAsFile();
  if (!file) return;
  event.preventDefault();

  const extension = mimeExtension(file.type);
  const renamed = new File([file], `pasted-image-${String(++pastedMediaCounter).padStart(3, "0")}.${extension}`, {
    type: file.type || "image/png",
    lastModified: Date.now()
  });

  selectedMediaFiles.set(renamed.name.toLowerCase(), renamed);
  manualMediaRefs = [renamed.name];
  renderManualMediaPreview();
  renderMediaList();
  updateComposerState();
  schedulePersistState();
  addLocalLog(`粘贴图片：${renamed.name}，${formatBytes(renamed.size)}`);
  setStatus(`图片已绑定到当前草稿：${renamed.name}`);
}

async function saveState() {
  if (isReplyMode()) {
    setError("回复排期请使用「解析回复」导入链接和回复正文。");
    return;
  }
  const hasDraft = Boolean(els.source.value.trim()) || manualMediaRefs.length > 0;
  if (!hasDraft && !queuedPosts.length) {
    setError("请输入一条帖子，或导入一个队列文件。");
    return;
  }

  let nextPosts = queuedPosts;
  try {
    if (hasDraft) {
      const existing = Number.isInteger(editingQueueIndex) ? queuedPosts[editingQueueIndex] : null;
      const draftPost = createManualPost(existing);
      nextPosts = [...queuedPosts];
      if (existing) {
        nextPosts[editingQueueIndex] = draftPost;
      } else {
        nextPosts.push(draftPost);
      }
    }
    schedulePosts(nextPosts, { validateMedia: false });
  } catch (error) {
    addLocalLog(`保存失败：${error.message}`);
    setError(error.message);
    return;
  }

  queuedPosts = nextPosts;
  if (hasDraft) clearDraft({ silent: true });
  await persistState();
  renderQueue({ validateMedia: false });

  try {
    schedulePosts(queuedPosts, { validateMedia: true });
    addLocalLog(`保存并更新队列预览：${queuedPosts.length} 条。`);
    if (getDeliveryMode() === "draft") {
      setStatus(hasDraft ? `草稿已保存，队列共 ${queuedPosts.length} 条。点击「存草稿」即可批量加入 X 草稿。` : `草稿预览已更新：${queuedPosts.length} 条。`);
    } else {
      setStatus(hasDraft ? `草稿已保存，队列共 ${queuedPosts.length} 条。点击「开始」即可排期。` : `已重新排期：${queuedPosts.length} 条。`);
    }
  } catch (error) {
    addLocalLog(`保存完成，媒体校验提醒：${error.message}`);
    setError(error.message);
  }
}

function previewQueue() {
  if (els.source.value.trim() || manualMediaRefs.length > 0) {
    setError("当前草稿尚未保存。请先保存至队列后再预览或开始。");
    return;
  }

  try {
    renderQueue({ validateMedia: true });
    const label = isReplyMode() ? "回复排期预览" : getDeliveryMode() === "draft" ? "草稿预览" : "排期预览";
    addLocalLog(`${label}通过：${getActiveQueue().length} 条。`);
    setStatus(`${label}通过：${getActiveQueue().length} 条。`);
  } catch (error) {
    addLocalLog(`预览失败：${error.message}`);
    setError(error.message);
  }
}

async function startQueue() {
  if (els.source.value.trim() || manualMediaRefs.length > 0) {
    setError("当前草稿尚未保存。请先保存后再开始。");
    return;
  }

  const deliveryMode = getDeliveryMode();
  let items;
  try {
    items = schedulePosts(getActiveQueue(), { validateMedia: true });
    if (!items.length) throw new Error(`队列为空。请先${isReplyMode() ? "导入回复" : "保存帖子或导入文件"}。`);
    validateRunMediaPayload(items);
  } catch (error) {
    addLocalLog(`构建队列失败：${error.message}`);
    setError(error.message);
    return;
  }

  if (isReplyMode()) {
    const existing = (await chrome.storage.local.get(STORAGE_KEYS.replyRunState))[STORAGE_KEYS.replyRunState];
    const completed = existing?.items?.filter((item) => item.status === "scheduled").length || 0;
    if (["failed", "stopping"].includes(existing?.status) && completed > 0) {
      setError(`已有 ${completed} 条回复完成。请点击「从失败项继续」，避免重复排期。`);
      return;
    }
  }

  addLocalLog(`准备${isReplyMode() ? "回复排期" : deliveryMode === "draft" ? "保存草稿" : "开始排期"}：${items.length} 条，媒体 ${countMedia(items)} 个，总媒体大小 ${formatBytes(totalMediaBytes(items))}`);
  const tab = await getActiveXTab();
  if (!tab) {
    addLocalLog("未找到 x.com / twitter.com 标签页。");
    setError("请先打开已登录的 x.com/home 标签页，再点击开始。");
    return;
  }

  addLocalLog(`目标标签页：${tab.url || "(unknown url)"}`);
  if (!isReplyMode()) {
    try {
      await ensureContentScript(tab.id);
    } catch (error) {
      addLocalLog(`页面脚本注入失败：${error.message || String(error)}`);
      setError("无法向 X 页面注入脚本。请刷新 x.com 页面，或确认扩展有 x.com 访问权限。");
      return;
    }
  }

  await persistState();
  renderPreview(items);
  setStatus(isReplyMode()
    ? "正在发送回复队列到后台，请保持目标 X 标签页打开。"
    : deliveryMode === "draft"
      ? "正在准备媒体并发送草稿队列，请不要关闭这个窗口。"
      : "正在准备媒体并发送排期队列，请不要关闭这个窗口。");

  let outboundItems;
  try {
    outboundItems = await prepareOutboundItems(items);
    addLocalLog(`媒体序列化完成：${countMedia(items)} 个。`);
  } catch (error) {
    addLocalLog(`媒体准备失败：${error.message}`);
    setError(error.message);
    return;
  }

  try {
    const delayMs = Math.max(600, Number(els.delaySeconds.value || 1.2) * 1000);
    addLocalLog(isReplyMode() ? "发送回复队列到扩展后台。" : "发送队列到 x.com 页面脚本。");
    const response = isReplyMode()
      ? await chrome.runtime.sendMessage({
        type: "xns-start-reply-queue",
        tabId: tab.id,
        items: outboundItems,
        delayMs
      })
      : await chrome.tabs.sendMessage(tab.id, {
        type: "xns-start-queue",
        items: outboundItems,
        options: { deliveryMode, delayMs }
      });

    if (!response || !response.ok) {
      addLocalLog(`页面脚本拒绝：${response?.error || "无响应内容"}`);
      setError(response?.error || "X 页面没有接受队列。请刷新 x.com 后重试。");
      return;
    }

    addLocalLog(`${isReplyMode() ? "扩展后台" : "页面脚本"}已接受队列，开始执行。`);
    setStatus(isReplyMode()
      ? "回复队列已启动。后台会逐条打开目标帖子并使用 X 原生排期。"
      : deliveryMode === "draft"
        ? "草稿队列已发送到 X 页面执行。请保持 x.com 标签页打开。"
        : "排期队列已发送到 X 页面执行。请保持 x.com 标签页打开。");
  } catch (error) {
    addLocalLog(`发送失败：${error.message || String(error)}`);
    setError("页面脚本未响应，或媒体数据过大。请刷新 x.com 后重试；大视频建议用 Playwright CLI。");
  }
}

async function stopQueue() {
  if (isReplyMode()) {
    const response = await chrome.runtime.sendMessage({ type: "xns-stop-reply-queue" });
    if (!response?.ok) {
      setError(response?.error || "停止回复队列失败。");
      return;
    }
    addLocalLog("已发送回复队列停止请求。");
    setStatus("已发送停止请求，当前步骤结束后不再继续。");
    return;
  }
  const tab = await getActiveXTab();
  if (!tab) {
    addLocalLog("停止失败：未找到 x.com / twitter.com 标签页。");
    setError("请先切换到正在运行的 x.com 标签页。");
    return;
  }
  try {
    await ensureContentScript(tab.id);
    await chrome.tabs.sendMessage(tab.id, { type: "xns-stop-queue" });
    addLocalLog("已发送停止请求。");
    setStatus("已发送停止请求。");
  } catch (error) {
    addLocalLog(`停止请求失败：${error.message || String(error)}`);
    setError("停止请求未发送成功，请检查 x.com 标签页是否还打开。");
  }
}

async function resumeReplyQueue() {
  if (!isReplyMode()) return;
  const tab = await getActiveXTab();
  if (!tab) {
    setError("请先打开已登录的 x.com 标签页，再恢复回复队列。");
    return;
  }
  const response = await chrome.runtime.sendMessage({ type: "xns-resume-reply-queue", tabId: tab.id });
  if (!response?.ok) {
    setError(response?.error || "恢复回复队列失败。");
    return;
  }
  addLocalLog("已从失败项恢复回复队列。");
  await renderRunState(response.state);
}

async function resetPluginState() {
  const confirmed = window.confirm("确定重置插件状态？这会清空当前草稿、队列、已选媒体、排期设置和日志，但不会删除 X 页面里已经生成的草稿。");
  if (!confirmed) return;

  clearTimeout(persistTimer);
  persistTimer = null;

  try {
    await requestStopCurrentRun();
  } catch (_error) {
    // Reset should still clear local plugin state even if the X tab is unavailable.
  }

  selectedMediaFiles = new Map();
  queuedPosts = [];
  queuedReplies = [];
  replyWarnings = [];
  workspaceSources.original = "";
  workspaceSources.reply = "";
  manualMediaRefs = [];
  lastItems = [];
  localLog = [];
  pastedMediaCounter = 0;
  editingQueueIndex = null;

  els.source.value = "";
  els.manualScheduledAt.value = "";
  els.fileInput.value = "";
  els.mediaInput.value = "";
  delete els.mediaInput.dataset.attachToDraft;

  setDefaultTimes();
  closeEmojiPanel();
  clearPreviewMediaUrls();
  renderManualMediaPreview();
  renderMediaList();
  renderQueue({ validateMedia: false, silent: true });
  updateComposerState();
  updateTimezoneSummary();
  updateSavedTimezoneHint();
  updateFirstDayStartHint();
  els.log.textContent = "";

  await chrome.storage.local.remove(Object.values(STORAGE_KEYS));
  setStatus("插件状态已重置。X 页面中已生成的草稿如需删除，请在 X 页面手动关闭或删除。", "success");
}

async function requestStopCurrentRun() {
  const replySaved = await chrome.storage.local.get(STORAGE_KEYS.replyRunState);
  const replyState = replySaved[STORAGE_KEYS.replyRunState];
  if (replyState && ["running", "failed"].includes(replyState.status)) {
    await chrome.runtime.sendMessage({ type: "xns-stop-reply-queue" });
  }

  const saved = await chrome.storage.local.get(STORAGE_KEYS.runState);
  const runState = saved[STORAGE_KEYS.runState];
  if (!runState?.running) return;

  const tab = await getActiveXTab();
  if (!tab) return;

  try {
    await chrome.tabs.sendMessage(tab.id, { type: "xns-stop-queue" });
  } catch (_error) {
    // The content script may already be gone after a page refresh.
  }
}

function createManualPost(existingPost = null) {
  const text = els.source.value.trim();
  if (!text && !manualMediaRefs.length) throw new Error("当前草稿为空。");

  const shouldUseScheduleTime = getDeliveryMode() === "schedule";
  const manualDate = shouldUseScheduleTime && els.manualScheduledAt.value ? parseDateTimeLocal(els.manualScheduledAt.value) : null;
  if (shouldUseScheduleTime && els.manualScheduledAt.value && !manualDate) throw new Error("当前草稿时间无效。");
  const scheduledAt = shouldUseScheduleTime ? manualDate : existingPost?.scheduledAt || null;
  const keepsDocumentTime = existingPost
    && existingPost.sourceType === "import"
    && !existingPost.lockedTime
    && shouldUseScheduleTime
    && sameMinute(manualDate, existingPost.scheduledAt);

  return {
    id: existingPost?.id || nextQueuedPostId(),
    text,
    scheduledAt,
    lockedTime: shouldUseScheduleTime ? Boolean(manualDate) && !keepsDocumentTime : Boolean(existingPost?.lockedTime),
    mediaRefs: [...manualMediaRefs],
    sourceType: existingPost?.sourceType || "manual"
  };
}

function normalizeImportedPost(post, index) {
  return {
    id: post.id || `post-${String(index + 1).padStart(3, "0")}`,
    text: post.text || "",
    scheduledAt: post.scheduledAt || null,
    lockedTime: false,
    mediaRefs: [...(post.mediaRefs || [])],
    sourceType: "import"
  };
}

function normalizeImportedReply(reply, index) {
  return {
    id: reply.id || `reply-${String(index + 1).padStart(3, "0")}`,
    text: reply.text || "",
    scheduledAt: reply.scheduledAtText ? parseHumanDateTime(reply.scheduledAtText) : null,
    lockedTime: false,
    mediaRefs: [],
    sourceType: "import",
    itemType: "reply",
    targetUrl: reply.targetUrl,
    targetStatusId: reply.targetStatusId
  };
}

function schedulePosts(posts, { validateMedia = true } = {}) {
  if (!posts.length) return [];
  if (getDeliveryMode() === "draft") {
    return buildDraftItems(posts, { validateMedia });
  }

  const config = normalizeScheduleOptions(getOptions());
  const nowEpochMs = Date.now();
  const now = XnsTimezone.epochToWallDate(nowEpochMs, config.timezone);
  const autoPosts = [];

  posts.forEach((post, index) => {
    const text = String(post.text || "").trim();
    if (!text && !(post.mediaRefs || []).length) throw new Error(`第 ${index + 1} 条内容为空。`);

    if (config.mode === "document" && !post.scheduledAt) {
      throw new Error(`第 ${index + 1} 条缺少 scheduled_at 或手动定时时间。`);
    }

    const explicitDate = getExplicitScheduleDate(post, config);
    if (!explicitDate) autoPosts.push({ post, index });
  });

  const autoAssignments = assignAutomaticDates(autoPosts, config, now);
  const items = posts.map((post, index) => {
    const text = String(post.text || "").trim();
    const assignment = autoAssignments.get(index);
    let date = assignment?.date || getExplicitScheduleDate(post, config);
    let scheduleSource = assignment ? "系统自动" : getExplicitScheduleSource(post);
    let jittered = Boolean(assignment?.jittered);
    let scheduleNote = "";

    if (assignment?.scheduleNote) scheduleNote = assignment.scheduleNote;
    if (!date || Number.isNaN(date.getTime())) throw new Error(`第 ${index + 1} 条时间无效。`);

    let dateMs = XnsTimezone.wallDateToEpoch(date, config.timezone);
    if (dateMs <= nowEpochMs + 60_000) {
      const minimumWallTime = XnsTimezone.epochToWallDate(nowEpochMs + 60_000, config.timezone);
      date = nextWindowStart(minimumWallTime, config);
      dateMs = XnsTimezone.wallDateToEpoch(date, config.timezone);
      scheduleSource = "系统自动";
      jittered = false;
      scheduleNote = "已过期，顺延到窗口";
    }

    const mediaFiles = validateMedia ? resolveMediaFiles(post, index) : collectAvailableMediaFiles(post);
    if (validateMedia) validateMediaSet(mediaFiles, index);

    return {
      id: post.id || `post-${String(index + 1).padStart(3, "0")}`,
      text,
      itemType: post.itemType || "post",
      targetUrl: post.targetUrl || "",
      targetStatusId: post.targetStatusId || "",
      date,
      dateMs,
      targetTimezone: config.timezone,
      deliveryMode: "schedule",
      queueIndex: index,
      scheduleSource,
      jittered,
      scheduleNote,
      mediaRefs: [...(post.mediaRefs || [])],
      mediaFiles
    };
  });

  return items.sort((a, b) => a.dateMs - b.dateMs);
}

function buildDraftItems(posts, { validateMedia = true } = {}) {
  return posts.map((post, index) => {
    const text = String(post.text || "").trim();
    if (!text && !(post.mediaRefs || []).length) throw new Error(`第 ${index + 1} 条内容为空。`);

    const mediaFiles = validateMedia ? resolveMediaFiles(post, index) : collectAvailableMediaFiles(post);
    if (validateMedia) validateMediaSet(mediaFiles, index);

    return {
      id: post.id || `post-${String(index + 1).padStart(3, "0")}`,
      text,
      itemType: post.itemType || "post",
      targetUrl: post.targetUrl || "",
      targetStatusId: post.targetStatusId || "",
      date: null,
      dateMs: null,
      targetTimezone: getTargetTimezone(),
      deliveryMode: "draft",
      queueIndex: index,
      scheduleSource: "保存草稿",
      jittered: false,
      scheduleNote: "",
      mediaRefs: [...(post.mediaRefs || [])],
      mediaFiles
    };
  });
}

function normalizeScheduleOptions(options) {
  const timezone = XnsTimezone.assertTimeZone(options.targetTimezone || "Asia/Shanghai");
  const dailyStart = parseClockTime(options.dailyStartTime || "08:00");
  const dailyEnd = parseClockTime(options.dailyEndTime || "23:00");
  if (!dailyStart || !dailyEnd) throw new Error("每日发布窗口格式无效。");
  if (dailyStart.totalMinutes >= dailyEnd.totalMinutes) throw new Error("每日结束时间必须晚于每日开始时间。");

  const startAt = parseOptionalDateTime(options.startAt, "排期开始时间");
  const endAt = parseOptionalDateTime(options.endAt, "排期结束时间");
  if (startAt && endAt && endAt.getTime() <= startAt.getTime()) {
    throw new Error("排期结束时间必须晚于排期开始时间。");
  }

  const mode = ["smart", "auto", "document"].includes(options.scheduleMode) ? options.scheduleMode : "smart";
  const firstDayStartMode = options.firstDayStartMode === "fixed" ? "fixed" : "adaptive";
  const strategy = options.scheduleStrategy === "fixed" ? "fixed" : "even";
  const intervalMs = Math.max(1, Number(options.intervalMinutes || 60)) * 60 * 1000;
  const jitterMinutes = Math.max(1, Number(options.jitterMinutes || 5));

  return {
    timezone,
    mode,
    firstDayStartMode,
    strategy,
    dailyStart,
    dailyEnd,
    startAt,
    endAt,
    intervalMs,
    jitterEnabled: Boolean(options.jitterEnabled),
    jitterMinutes
  };
}

function parseOptionalDateTime(value, label) {
  if (!value) return null;
  const date = parseDateTimeLocal(value);
  if (!date) throw new Error(`${label}无效。`);
  return date;
}

function parseClockTime(value) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return {
    hours,
    minutes,
    totalMinutes: hours * 60 + minutes
  };
}

function getExplicitScheduleDate(post, config) {
  if (config.mode === "auto" && !post.lockedTime) return null;
  return post.scheduledAt || null;
}

function getExplicitScheduleSource(post) {
  if (post.lockedTime || post.sourceType === "manual") return "手动指定";
  return "文档指定";
}

function assignAutomaticDates(autoPosts, config, now) {
  if (!autoPosts.length) return new Map();
  return config.strategy === "fixed"
    ? assignFixedAutomaticDates(autoPosts, config, now)
    : assignEvenAutomaticDates(autoPosts, config, now);
}

function assignEvenAutomaticDates(autoPosts, config, now) {
  const assignments = new Map();
  const range = getAutomaticRange(config, now);
  let windows = collectWindowsUntil(range.start, range.end, config);

  if (!windows.length) {
    const firstOverflowStart = nextWindowStart(range.start, config);
    windows = [createWindowForDate(firstOverflowStart, config, true)];
  }

  ensureWindowCapacity(windows, autoPosts.length, config);

  let previousAutoDate = null;
  for (let order = 0; order < autoPosts.length; order += 1) {
    const ratio = autoPosts.length === 1 ? 0 : order / (autoPosts.length - 1);
    const baseDate = roundToMinute(dateAtWindowRatio(windows, ratio));
    const window = findWindowForDate(windows, baseDate) || windows[windows.length - 1];
    const jitterResult = applyScheduleJitter(baseDate, autoPosts[order].post, autoPosts[order].index, config, previousAutoDate);
    const date = jitterResult.date;
    previousAutoDate = date;
    assignments.set(autoPosts[order].index, {
      date,
      jittered: jitterResult.jittered,
      scheduleNote: window.overflow ? "顺延到次日窗口" : ""
    });
  }

  return assignments;
}

function assignFixedAutomaticDates(autoPosts, config, now) {
  const assignments = new Map();
  const range = getAutomaticRange(config, now);
  let cursor = nextWindowStart(range.start, config);
  let overflowStarted = false;
  let previousAutoDate = null;

  for (const autoPost of autoPosts) {
    if (!overflowStarted && cursor.getTime() > range.end.getTime()) {
      cursor = startOfNextDailyWindow(range.end, config);
      overflowStarted = true;
    }

    const baseDate = nextWindowStart(cursor, config);
    const isOverflow = overflowStarted || baseDate.getTime() > range.end.getTime();
    const jitterResult = applyScheduleJitter(baseDate, autoPost.post, autoPost.index, config, previousAutoDate);
    const date = jitterResult.date;
    previousAutoDate = date;
    assignments.set(autoPost.index, {
      date,
      jittered: jitterResult.jittered,
      scheduleNote: isOverflow ? "顺延到次日窗口" : ""
    });

    cursor = new Date(baseDate.getTime() + config.intervalMs);
  }

  return assignments;
}

function getAutomaticRange(config, now) {
  const configuredStart = config.startAt || getDefaultAutomaticStart(config, now);
  const minimumStart = new Date(now.getTime() + 60_000);
  const start = configuredStart.getTime() <= minimumStart.getTime() ? minimumStart : configuredStart;
  const normalizedStart = nextWindowStart(start, config);
  const end = config.endAt || windowEndForDate(normalizedStart, config);
  return { start: normalizedStart, end };
}

function getDefaultAutomaticStart(config, now) {
  return XnsTimezone.resolveDefaultAutomaticStart(now, {
    mode: config.firstDayStartMode,
    dailyStartMinutes: config.dailyStart.totalMinutes,
    dailyEndMinutes: config.dailyEnd.totalMinutes,
    leadMinutes: 10
  });
}

function collectWindowsUntil(start, end, config) {
  const windows = [];
  const cursor = startOfDay(start);
  const endDay = startOfDay(end);
  let guard = 0;

  while (cursor.getTime() <= endDay.getTime() && guard < 370) {
    const dayWindow = createWindowForDate(cursor, config, false);
    let windowStart = dayWindow.start;
    let windowEnd = dayWindow.end;
    if (isSameDate(cursor, start) && start.getTime() > windowStart.getTime()) windowStart = new Date(start);
    if (isSameDate(cursor, end) && end.getTime() < windowEnd.getTime()) windowEnd = new Date(end);
    if (windowEnd.getTime() >= windowStart.getTime()) {
      windows.push({ start: roundToMinute(windowStart), end: roundToMinute(windowEnd), overflow: false });
    }
    cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }

  return windows;
}

function ensureWindowCapacity(windows, requiredCount, config) {
  let guard = 0;
  while (windowCapacity(windows) < requiredCount && guard < 370) {
    const lastWindow = windows[windows.length - 1];
    const nextStart = startOfNextDailyWindow(lastWindow.end, config);
    windows.push(createWindowForDate(nextStart, config, true));
    guard += 1;
  }
}

function windowCapacity(windows) {
  return windows.reduce((sum, window) => {
    return sum + Math.floor((window.end.getTime() - window.start.getTime()) / 60_000) + 1;
  }, 0);
}

function dateAtWindowRatio(windows, ratio) {
  const totalDuration = windows.reduce((sum, window) => sum + Math.max(0, window.end.getTime() - window.start.getTime()), 0);
  if (totalDuration <= 0) return new Date(windows[0].start);

  let offset = totalDuration * ratio;
  for (const window of windows) {
    const duration = Math.max(0, window.end.getTime() - window.start.getTime());
    if (offset <= duration) return new Date(window.start.getTime() + offset);
    offset -= duration;
  }

  return new Date(windows[windows.length - 1].end);
}

function findWindowForDate(windows, date) {
  return windows.find(window => date.getTime() >= window.start.getTime() && date.getTime() <= window.end.getTime());
}

function applyScheduleJitter(baseDate, post, index, config, previousAutoDate) {
  if (!config.jitterEnabled || config.jitterMinutes < 1) {
    return { date: baseDate, jittered: false };
  }

  const offsetMinutes = deterministicJitterMinutes(`${post.id || index}|${index}|${formatDateTime(baseDate)}`, config.jitterMinutes);
  let date = new Date(baseDate.getTime() + offsetMinutes * 60_000);
  const dayWindow = createWindowForDate(baseDate, config, false);
  if (date.getTime() < dayWindow.start.getTime()) date = new Date(dayWindow.start);
  if (date.getTime() > dayWindow.end.getTime()) date = new Date(dayWindow.end);
  if (previousAutoDate && date.getTime() <= previousAutoDate.getTime()) {
    const nextMinute = new Date(previousAutoDate.getTime() + 60_000);
    if (nextMinute.getTime() <= dayWindow.end.getTime()) date = nextMinute;
  }

  return {
    date: roundToMinute(date),
    jittered: offsetMinutes !== 0
  };
}

function deterministicJitterMinutes(seed, maxMinutes) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const span = maxMinutes * 2 + 1;
  return (Math.abs(hash) % span) - maxMinutes;
}

function nextWindowStart(date, config) {
  const rounded = roundUpToMinute(date);
  const dayWindow = createWindowForDate(rounded, config, false);
  if (rounded.getTime() <= dayWindow.start.getTime()) return dayWindow.start;
  if (rounded.getTime() <= dayWindow.end.getTime()) return rounded;
  return startOfNextDailyWindow(rounded, config);
}

function createWindowForDate(date, config, overflow) {
  const start = startOfDay(date);
  start.setHours(config.dailyStart.hours, config.dailyStart.minutes, 0, 0);
  const end = startOfDay(date);
  end.setHours(config.dailyEnd.hours, config.dailyEnd.minutes, 0, 0);
  return { start, end, overflow };
}

function windowEndForDate(date, config) {
  return createWindowForDate(date, config, false).end;
}

function startOfNextDailyWindow(date, config) {
  const next = startOfDay(date);
  next.setDate(next.getDate() + 1);
  next.setHours(config.dailyStart.hours, config.dailyStart.minutes, 0, 0);
  return next;
}

function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function isSameDate(left, right) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

function roundToMinute(date) {
  const next = new Date(date);
  next.setSeconds(0, 0);
  return next;
}

function roundUpToMinute(date) {
  const next = new Date(date);
  if (next.getSeconds() || next.getMilliseconds()) {
    next.setMinutes(next.getMinutes() + 1);
  }
  next.setSeconds(0, 0);
  return next;
}

function resolveMediaFiles(post, index) {
  const files = [];
  for (const name of post.mediaRefs || []) {
    const file = selectedMediaFiles.get(name.toLowerCase());
    if (!file) throw new Error(`第 ${index + 1} 条引用了媒体 ${name}，但没有在媒体素材中选择或粘贴这个文件。`);
    files.push(file);
  }
  return files;
}

function collectAvailableMediaFiles(post) {
  return (post.mediaRefs || [])
    .map(name => selectedMediaFiles.get(name.toLowerCase()))
    .filter(Boolean);
}

function validateMediaSet(files, index) {
  if (!files.length) return;

  const videos = files.filter(file => (file.type || inferMimeType(file.name)).startsWith("video/"));
  const images = files.filter(file => (file.type || inferMimeType(file.name)).startsWith("image/"));
  if (videos.length && files.length > 1) throw new Error(`第 ${index + 1} 条包含视频时不能再混合其他媒体。`);
  if (!videos.length && images.length > 4) throw new Error(`第 ${index + 1} 条最多支持 4 张图片。`);

  for (const file of files) {
    const type = file.type || inferMimeType(file.name);
    if (!type.startsWith("image/") && !type.startsWith("video/")) {
      throw new Error(`第 ${index + 1} 条媒体类型不支持：${file.name}`);
    }
    if (file.size > MAX_MEDIA_BYTES) {
      throw new Error(`媒体 ${file.name} 超过 25MB。扩展测试版只适合图片和小视频，大视频请用 Playwright CLI。`);
    }
  }
}

function validateRunMediaPayload(items) {
  const totalBytes = totalMediaBytes(items);
  if (totalBytes > MAX_RUN_MEDIA_BYTES) {
    throw new Error(`本次队列媒体总大小 ${formatBytes(totalBytes)} 超过 ${formatBytes(MAX_RUN_MEDIA_BYTES)}。请分批运行，避免扩展消息通道传输失败。`);
  }
}

function renderQueue({ validateMedia = false, silent = false } = {}) {
  let items = [];
  try {
    items = schedulePosts(getActiveQueue(), { validateMedia });
    lastItems = items;
    renderPreview(items);
    updateQueueCount(items.length);
  } catch (error) {
    renderPreview(lastItems);
    updateQueueCount(getActiveQueue().length);
    if (!silent) setError(error.message);
    if (!silent) throw error;
  }
  return items;
}

function renderPreview(items) {
  clearPreviewMediaUrls();
  if (!items.length) {
    renderEmptyPreview();
    return;
  }

  els.previewList.innerHTML = items.map((item, index) => {
    const media = item.mediaRefs.length ? escapeHtml(item.mediaRefs.join(", ")) : "无媒体";
    const editingClass = editingQueueIndex === item.queueIndex ? " is-editing" : "";
    const isDraftItem = item.deliveryMode === "draft";
    const editAttribute = isReplyMode() ? "" : ` data-edit-queue-index="${item.queueIndex}"`;
    const targetLine = item.itemType === "reply"
      ? `<div class="input-hint">目标帖：${escapeHtml(item.targetUrl)}</div>`
      : "";
    return `
      <article class="preview-item${editingClass}"${editAttribute}>
        <div class="avatar">${PLUGIN_LOGO_HTML}</div>
        <div>
          <div class="tweet-head">
            <div class="account">X Scheduler <span>@queue · ${isDraftItem ? "待存草稿" : "已排期"}</span></div>
            <div class="tweet-head-badges">
              <span class="time-badge count-badge">${index + 1}/${items.length}</span>
              <span class="time-badge">${isDraftItem ? "不排期" : `${escapeHtml(XnsTimezone.formatZoneLabel(item.targetTimezone, item.dateMs))} ${formatDateTime(item.date)}`}</span>
              ${isDraftItem ? "" : `<span class="time-badge">本机 ${escapeHtml(XnsTimezone.formatEpochInZone(item.dateMs, getBrowserTimezone()))}</span>`}
            </div>
          </div>
          ${targetLine}
          <div class="tweet-body">${escapeHtml(item.text)}</div>
          ${renderPreviewMedia(item.mediaFiles)}
          <div class="pill-row">
            <span class="pill">${item.text.length} 字</span>
            <span class="pill">${escapeHtml(item.id)}</span>
            ${item.itemType === "reply" ? `<span class="pill">回复 ${escapeHtml(item.targetStatusId)}</span>` : `<span class="pill">${media}</span>`}
            ${renderScheduleBadges(item)}
            <button class="preview-delete pill-delete" type="button" data-delete-queue-index="${item.queueIndex}">删除</button>
          </div>
        </div>
      </article>
    `;
  }).join("");
}

function renderScheduleBadges(item) {
  const badges = [`<span class="pill source-pill">${escapeHtml(item.scheduleSource || "系统自动")}</span>`];
  if (item.jittered) badges.push(`<span class="pill">随机波动</span>`);
  if (item.scheduleNote) badges.push(`<span class="pill warning-pill">${escapeHtml(item.scheduleNote)}</span>`);
  return badges.join("");
}

function renderEmptyPreview(message = "") {
  clearPreviewMediaUrls();
  const title = isReplyMode() ? "暂无回复预览" : getDeliveryMode() === "draft" ? "暂无草稿预览" : "暂无排期预览";
  const detail = message || (isReplyMode()
    ? "导入或解析回复队列后，目标链接、正文和双时区时间会显示在此处。"
    : "保存草稿或导入文件后，队列将显示在此处。");
  els.previewList.innerHTML = `
    <div class="empty-state">
      <strong>${title}</strong>
      <span>${escapeHtml(detail)}</span>
    </div>
  `;
}

function renderPreviewMedia(files) {
  if (!files || !files.length) return "";
  const visibleFiles = files.slice(0, 4);
  const className = visibleFiles.length === 1 ? "tweet-media single" : "tweet-media";
  return `
    <div class="${className}">
      ${visibleFiles.map(file => {
        const url = createPreviewUrl(file);
        const type = file.type || inferMimeType(file.name);
        if (type.startsWith("video/")) {
          return `<video src="${escapeHtml(url)}" muted playsinline controls></video>`;
        }
        return `<img src="${escapeHtml(url)}" alt="${escapeHtml(file.name)}">`;
      }).join("")}
    </div>
  `;
}

function createPreviewUrl(file) {
  const url = URL.createObjectURL(file);
  previewMediaUrls.push(url);
  return url;
}

function clearPreviewMediaUrls() {
  for (const url of previewMediaUrls) URL.revokeObjectURL(url);
  previewMediaUrls = [];
}

function renderManualMediaPreview() {
  if (!manualMediaRefs.length) {
    els.manualMediaPreview.innerHTML = "";
    return;
  }

  els.manualMediaPreview.innerHTML = manualMediaRefs.map(name => {
    const file = selectedMediaFiles.get(name.toLowerCase());
    const detail = file ? `${file.type || inferMimeType(file.name)} · ${formatBytes(file.size)}` : "未匹配到文件";
    return `
      <div class="draft-media-item">
        <div>
          <div class="draft-media-name">${escapeHtml(name)}</div>
          <div class="draft-media-detail">${escapeHtml(detail)}</div>
        </div>
        <button class="preview-delete" type="button" data-remove-draft-media="${escapeHtml(name)}">删除</button>
      </div>
    `;
  }).join("");
}

function renderMediaList() {
  const files = [...selectedMediaFiles.values()];
  if (!files.length) {
    els.mediaList.innerHTML = `
      <div class="empty-state">
        <strong>暂无媒体素材</strong>
      </div>
    `;
    return;
  }

  els.mediaList.innerHTML = files.map(file => `
    <div class="media-item">
      <span class="media-name">${escapeHtml(file.name)}</span>
      <span class="media-detail">${escapeHtml(file.type || inferMimeType(file.name))} · ${formatBytes(file.size)}</span>
    </div>
  `).join("");
}

function updateComposerState() {
  const text = els.source.value.trim();
  els.charCount.textContent = `${text.length} 字`;
  els.save.classList.toggle("ready", Boolean(text) || manualMediaRefs.length > 0);
  updateQueueCount(getActiveQueue().length);
  autoResizeTextarea();
}

function autoResizeTextarea() {
  const el = els.source;
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, 400)}px`;
}

function setupEmojiPicker() {
  els.emojiPicker.i18n = zhCnI18n;
  els.emojiPicker.locale = "zh";
  els.emojiPicker.dataSource = "vendor/emoji-picker-element-data/zh/emojibase/data.json";
}

function positionEmojiPanel(trigger) {
  const btnRect = trigger.getBoundingClientRect();
  const panelW = els.emojiPanel.offsetWidth || 360;
  const panelH = els.emojiPanel.offsetHeight || 390;
  const gap = 6;
  let left = btnRect.right - panelW + gap;
  let top = btnRect.bottom + gap;
  if (left < 8) left = 8;
  if (left + panelW > window.innerWidth - 8) left = window.innerWidth - panelW - 8;
  if (top + panelH > window.innerHeight - 8) top = btnRect.top - panelH - gap;
  if (top < 8) top = 8;
  els.emojiPanel.style.left = `${left}px`;
  els.emojiPanel.style.top = `${top}px`;
}

function closeEmojiPanel() {
  els.emojiPanel.classList.remove("open");
}

function insertAtCursor(text) {
  const start = els.source.selectionStart ?? els.source.value.length;
  const end = els.source.selectionEnd ?? start;
  els.source.value = `${els.source.value.slice(0, start)}${text}${els.source.value.slice(end)}`;
  const cursor = start + text.length;
  els.source.focus();
  els.source.setSelectionRange(cursor, cursor);
  updateComposerState();
  schedulePersistState();
}

function updateQueueCount(count = getActiveQueue().length) {
  els.queueCount.textContent = `${count} 条`;
}

function clearDraft({ silent = false } = {}) {
  els.source.value = "";
  workspaceSources[workspaceMode] = "";
  els.manualScheduledAt.value = "";
  manualMediaRefs = [];
  editingQueueIndex = null;
  renderManualMediaPreview();
  renderQueue({ validateMedia: false, silent: true });
  updateComposerState();
  schedulePersistState();
  if (!silent) setStatus("当前输入已清空，右侧队列不受影响。");
}

function removeDraftMedia(name) {
  manualMediaRefs = manualMediaRefs.filter(item => item !== name);
  renderManualMediaPreview();
  updateComposerState();
  schedulePersistState();
  setStatus("已从当前草稿移除媒体。");
}

async function deleteQueuedPost(queueIndex) {
  const queue = getActiveQueue();
  if (!Number.isInteger(queueIndex) || queueIndex < 0 || queueIndex >= queue.length) return;
  const nextQueue = [...queue];
  const [removed] = nextQueue.splice(queueIndex, 1);
  replaceActiveQueue(nextQueue);
  if (editingQueueIndex === queueIndex) {
    editingQueueIndex = null;
    els.source.value = "";
    els.manualScheduledAt.value = "";
    manualMediaRefs = [];
    renderManualMediaPreview();
  } else if (editingQueueIndex > queueIndex) {
    editingQueueIndex -= 1;
  }
  await persistState();
  renderQueue({ validateMedia: false });
  updateComposerState();
  addLocalLog(`删除队列帖子：${removed?.id || queueIndex + 1}`);
  setStatus(`已删除 1 条${isReplyMode() ? "回复" : "帖子"}，队列剩余 ${getActiveQueue().length} 条。`);
}

function loadQueuedPostForEdit(queueIndex) {
  if (isReplyMode()) return;
  if (!Number.isInteger(queueIndex) || queueIndex < 0 || queueIndex >= queuedPosts.length) return;
  const post = queuedPosts[queueIndex];

  editingQueueIndex = queueIndex;
  els.source.value = post.text || "";
  els.manualScheduledAt.value = post.scheduledAt ? toDateTimePlaceholderFormat(post.scheduledAt) : "";
  manualMediaRefs = [...(post.mediaRefs || [])];
  renderManualMediaPreview();
  renderQueue({ validateMedia: false, silent: true });
  updateComposerState();
  schedulePersistState();
  const timeHint = post.scheduledAt ? "当前时间会随保存保留。" : "当前帖仍保持系统自动排期。";
  setStatus(`正在编辑 ${post.id || `第 ${queueIndex + 1} 条`}，保存后会替换右侧原帖。${timeHint}`);
}

function nextQueuedPostId() {
  let max = 0;
  for (const post of queuedPosts) {
    const match = String(post.id || "").match(/^post-(\d+)$/i);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `post-${String(max + 1).padStart(3, "0")}`;
}

function serializePost(post) {
  return {
    id: post.id,
    text: post.text,
    scheduledAt: post.scheduledAt ? post.scheduledAt.toISOString() : null,
    lockedTime: Boolean(post.lockedTime),
    mediaRefs: [...(post.mediaRefs || [])],
    sourceType: post.sourceType || "import",
    itemType: post.itemType || "post",
    targetUrl: post.targetUrl || "",
    targetStatusId: post.targetStatusId || ""
  };
}

function hydratePost(post) {
  if (!post || !post.text) return null;
  return {
    id: post.id,
    text: post.text,
    scheduledAt: post.scheduledAt ? new Date(post.scheduledAt) : null,
    lockedTime: Boolean(post.lockedTime),
    mediaRefs: Array.isArray(post.mediaRefs) ? post.mediaRefs : [],
    sourceType: post.sourceType || "import",
    itemType: post.itemType || "post",
    targetUrl: post.targetUrl || "",
    targetStatusId: post.targetStatusId || ""
  };
}

async function prepareOutboundItems(items) {
  return Promise.all(items.map(async item => ({
    id: item.id,
    text: item.text,
    itemType: item.itemType || "post",
    targetUrl: item.targetUrl || "",
    targetStatusId: item.targetStatusId || "",
    targetTimezone: item.targetTimezone || getTargetTimezone(),
    deliveryMode: item.deliveryMode || getDeliveryMode(),
    dateMs: item.dateMs ?? null,
    media: await Promise.all(item.mediaFiles.map(fileToPayload))
  })));
}

function fileToPayload(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      resolve({
        name: file.name,
        type: file.type || inferMimeType(file.name),
        size: file.size,
        dataUrl: reader.result
      });
    });
    reader.addEventListener("error", () => reject(new Error(`读取媒体失败：${file.name}`)));
    reader.readAsDataURL(file);
  });
}

async function getActiveXTab() {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (active && /^https:\/\/(x|twitter)\.com\//.test(active.url || "")) return active;
  const matches = await chrome.tabs.query({ url: ["https://x.com/*", "https://twitter.com/*"] });
  addLocalLog(`查找 X 标签页：当前窗口活动页=${active?.url || "(none)"}，全浏览器匹配=${matches.length}`);
  return matches[0] || null;
}

async function ensureContentScript(tabId) {
  try {
    const ping = await chrome.tabs.sendMessage(tabId, { type: "xns-get-status" });
    if (ping && ping.ok) {
      addLocalLog("页面脚本已存在。");
      return;
    }
  } catch (error) {
    addLocalLog(`页面脚本未响应，准备主动注入：${error.message || String(error)}`);
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["reply-core.js", "content.js"]
  });

  const response = await chrome.tabs.sendMessage(tabId, { type: "xns-get-status" });
  if (!response || !response.ok) throw new Error("注入后页面脚本仍未响应。");
  addLocalLog("页面脚本主动注入成功。");
}

function parseSource(raw, options = {}) {
  const text = unwrapQueueText(String(raw || "").trim());
  if (!text) return [];

  if (/^---\s*post\s*---\s*$/im.test(text)) {
    return parsePostBlocks(text, options);
  }

  return parseLoosePosts(text);
}

function validateDeclaredTimezone(raw) {
  const match = String(raw || "").match(/^\s*timezone\s*:\s*([^\s#]+)/im);
  if (!match) return "";

  const declared = match[1].trim();
  const selected = getTargetTimezone();
  if (declared !== selected) {
    throw new Error(`队列 timezone 为 ${declared}，当前目标时区为 ${selected}。请切换目标时区后重试。`);
  }
  return declared;
}

function unwrapQueueText(text) {
  const match = text.match(/^```(?:md|markdown)?\s*\n([\s\S]*?)\n```\s*$/i);
  return match ? match[1].trim() : text;
}

function parsePostBlocks(raw, options = {}) {
  const chunks = raw
    .split(/^---\s*post\s*---\s*$/gim)
    .slice(1)
    .map(chunk => chunk.trim())
    .filter(Boolean);

  return chunks.map((chunk, index) => parseSingleBlock(chunk, index, options));
}

function parseSingleBlock(chunk, index, options = {}) {
  const lines = chunk.replace(/\r\n/g, "\n").split("\n");
  const meta = {};
  const mediaRefs = [];
  let cursor = 0;

  while (cursor < lines.length && !lines[cursor].trim()) cursor += 1;

  while (cursor < lines.length) {
    const line = lines[cursor];
    if (!line.trim()) {
      cursor += 1;
      break;
    }
    const match = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (!match) break;
    const key = match[1].toLowerCase();
    if (!["id", "scheduled_at", "datetime", "date", "time", "media", "image", "images", "video", "videos"].includes(key)) break;
    if (["media", "image", "images", "video", "videos"].includes(key)) {
      mediaRefs.push(...parseMediaRefs(match[2]));
    } else {
      meta[key] = match[2].trim();
    }
    cursor += 1;
  }

  const body = lines.slice(cursor).join("\n").trim();
  const scheduled = meta.scheduled_at || meta.datetime || (meta.date && meta.time ? `${meta.date} ${meta.time}` : "");
  const scheduledAt = parseOptionalPostSchedule(scheduled, options);
  return {
    id: meta.id || `post-${String(index + 1).padStart(3, "0")}`,
    scheduledAt,
    mediaRefs,
    text: body
  };
}

function parseOptionalPostSchedule(value, options = {}) {
  if (!value) return null;
  if (!options.lenientSchedule) return parseHumanDateTime(value);
  try {
    return parseHumanDateTime(value);
  } catch (_error) {
    return null;
  }
}

function parseMediaRefs(value) {
  return String(value || "")
    .split(/[,，]/)
    .map(name => name.trim())
    .filter(Boolean);
}

function parseLoosePosts(raw) {
  return raw
    .split(/\n{2,}/)
    .map(block => block.trim())
    .filter(Boolean)
    .map((text, index) => ({
      id: `post-${String(index + 1).padStart(3, "0")}`,
      scheduledAt: null,
      mediaRefs: [],
      text
    }));
}

function renderTimezoneOptions(query = "") {
  const now = Date.now();
  const current = els.targetTimezone.value || "Asia/Shanghai";
  const needle = String(query || "").trim().toLowerCase();
  const matches = XnsTimezone.TIMEZONE_OPTIONS.filter((option) => {
    if (!needle) return true;
    const label = XnsTimezone.formatZoneLabel(option.id, now);
    return [option.id, option.city, label, ...(option.aliases || [])]
      .some((value) => String(value).toLowerCase().includes(needle));
  });
  const selectedOption = XnsTimezone.TIMEZONE_OPTIONS.find((option) => option.id === current);
  const options = selectedOption && !matches.some((option) => option.id === current)
    ? [selectedOption, ...matches]
    : matches;
  els.targetTimezone.innerHTML = options.map((option) => (
    `<option value="${escapeHtml(option.id)}">${escapeHtml(XnsTimezone.formatZoneLabel(option.id, now))} — ${escapeHtml(option.id)}</option>`
  )).join("");
  if (options.some((option) => option.id === current)) els.targetTimezone.value = current;
}

function updateTimezoneSummary() {
  try {
    const target = getTargetTimezone();
    const browser = getBrowserTimezone();
    els.targetTimezoneLabel.textContent = `目标：${XnsTimezone.formatZoneLabel(target)} · ${target}`;
    els.browserTimezoneLabel.textContent = `本机：${XnsTimezone.formatZoneLabel(browser)} · ${browser}`;
  } catch (error) {
    els.targetTimezoneLabel.textContent = error.message;
    els.browserTimezoneLabel.textContent = "";
  }
}

async function saveDefaultTimezone() {
  const timezone = getTargetTimezone();
  await chrome.storage.local.set({ [DEFAULT_TIMEZONE_KEY]: timezone });
  savedDefaultTimezone = timezone;
  updateSavedTimezoneHint();
  setStatus(`已保存默认时区：${XnsTimezone.formatZoneLabel(timezone)} · ${timezone}`, "success");
}

function updateSavedTimezoneHint() {
  if (!savedDefaultTimezone) {
    els.saveTimezone.disabled = false;
    els.saveTimezone.textContent = "保存为默认时区";
    els.savedTimezoneHint.textContent = "尚未保存默认时区";
    return;
  }
  const isCurrent = getTargetTimezone() === savedDefaultTimezone;
  els.saveTimezone.disabled = isCurrent;
  els.saveTimezone.textContent = isCurrent ? "已保存为默认" : "保存为默认时区";
  els.savedTimezoneHint.textContent = isCurrent
    ? "当前选择已保存"
    : `已保存：${XnsTimezone.formatZoneLabel(savedDefaultTimezone)} · ${savedDefaultTimezone}`;
}

function updateFirstDayStartHint() {
  try {
    const dailyStart = parseClockTime(els.dailyStartTime.value || "08:00");
    const dailyEnd = parseClockTime(els.dailyEndTime.value || "23:00");
    if (!dailyStart || !dailyEnd) throw new Error("请填写有效的每日发布窗口。");
    const timezone = getTargetTimezone();
    const now = XnsTimezone.epochToWallDate(Date.now(), timezone);
    const start = XnsTimezone.resolveDefaultAutomaticStart(now, {
      mode: els.firstDayStartMode.value,
      dailyStartMinutes: dailyStart.totalMinutes,
      dailyEndMinutes: dailyEnd.totalMinutes,
      leadMinutes: 10
    });
    const dayLabel = isSameDate(start, now) ? "今天" : "明天";
    const modeLabel = els.firstDayStartMode.value === "fixed" ? "固定时间" : "智能时间";
    els.firstDayStartHint.textContent = `${modeLabel}：首批将从${dayLabel} ${formatDateTime(start).slice(11)} 开始；跨日后从 ${els.dailyStartTime.value} 开始。`;
  } catch (error) {
    els.firstDayStartHint.textContent = error.message;
  }
}

function getValidTimezoneOrEmpty(value) {
  try {
    return value ? XnsTimezone.assertTimeZone(value) : "";
  } catch (_error) {
    return "";
  }
}

function getTargetTimezone() {
  return XnsTimezone.assertTimeZone(els.targetTimezone.value || "Asia/Shanghai");
}

function getBrowserTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai";
}

function getOptions() {
  return {
    targetTimezone: getTargetTimezone(),
    deliveryMode: getDeliveryMode(),
    manualScheduledAt: els.manualScheduledAt.value,
    scheduleMode: els.scheduleMode.value,
    firstDayStartMode: els.firstDayStartMode.value,
    dailyStartTime: els.dailyStartTime.value,
    dailyEndTime: els.dailyEndTime.value,
    startAt: els.startAt.value,
    endAt: els.endAt.value,
    scheduleStrategy: getScheduleStrategy(),
    intervalMinutes: els.intervalMinutes.value,
    jitterEnabled: els.jitterEnabled.checked,
    jitterMinutes: els.jitterMinutes.value,
    delaySeconds: els.delaySeconds.value
  };
}

function getDeliveryMode() {
  if (isReplyMode()) return "schedule";
  return els.deliveryModeInputs.find(input => input.checked)?.value === "draft" ? "draft" : "schedule";
}

function setDeliveryMode(mode) {
  const safeMode = mode === "draft" ? "draft" : "schedule";
  for (const input of els.deliveryModeInputs) {
    input.checked = input.value === safeMode;
  }
}

function getScheduleStrategy() {
  return els.scheduleStrategyInputs.find(input => input.checked)?.value || "even";
}

function setScheduleStrategy(strategy) {
  const safeStrategy = strategy === "fixed" ? "fixed" : "even";
  for (const input of els.scheduleStrategyInputs) {
    input.checked = input.value === safeStrategy;
  }
}

function syncScheduleControls() {
  const isDraftMode = getDeliveryMode() === "draft";
  const isFixed = getScheduleStrategy() === "fixed";
  const jitterEnabled = els.jitterEnabled.checked;
  const scheduleOnlyInputs = [
    els.manualScheduledAt,
    els.scheduleMode,
    els.firstDayStartMode,
    els.dailyStartTime,
    els.dailyEndTime,
    els.startAt,
    els.endAt,
    els.jitterEnabled,
    ...els.scheduleStrategyInputs
  ];

  for (const section of els.scheduleOnlySections) {
    section.classList.toggle("is-disabled", isDraftMode);
  }
  for (const input of scheduleOnlyInputs) {
    input.disabled = isDraftMode;
  }

  els.intervalMinutes.disabled = isDraftMode || !isFixed;
  els.fixedIntervalField.classList.toggle("schedule-field-disabled", isDraftMode || !isFixed);
  els.jitterMinutes.disabled = isDraftMode || !jitterEnabled;
  els.jitterMinutesField.classList.toggle("schedule-field-disabled", isDraftMode || !jitterEnabled);
  els.deliveryModeHint.textContent = isDraftMode
    ? "保存草稿只会把内容加入 X 草稿，不打开定时排期。"
    : "排期发布会逐条进入 X 原生定时流程。";
  els.preview.textContent = isDraftMode ? "预览草稿" : "预览队列";
  els.start.textContent = isDraftMode ? "存草稿" : "开始";
}

async function renderRunState(runState) {
  const key = isReplyMode() ? STORAGE_KEYS.replyRunState : STORAGE_KEYS.runState;
  const state = runState || (await chrome.storage.local.get(key))[key];
  if (!state) return;

  const replyProgress = isReplyMode() && Array.isArray(state.items)
    ? `${state.items.filter((item) => item.status === "scheduled").length}/${state.items.length}`
    : "";
  const showProgress = state.status === "running" && state.progress;
  const progress = replyProgress || (showProgress ? `${state.progress.current || 0}/${state.progress.total || 0}` : "");
  const statusType = ["error", "failed"].includes(state.status) ? "error" : state.status === "done" ? "success" : "info";
  setStatus(progress ? `${state.message} (${progress})` : state.message, statusType);
  renderLog(Array.isArray(state.log) ? state.log : []);
}

function pollRunState() {
  setInterval(renderRunState, 1500);
}

function setStatus(message, type = "info") {
  els.status.classList.toggle("error", type === "error");
  els.status.classList.toggle("success", type === "success");
  els.status.textContent = type === "error" ? `⚠ ${message}` : message;
}

function setError(message) {
  setStatus(message, "error");
}

function addLocalLog(message) {
  const stamp = new Date().toLocaleTimeString();
  localLog.push(`[${stamp}] POPUP ${message}`);
  localLog = localLog.slice(-120);
  renderLog();
}

function renderLog(remoteLog = null) {
  const remote = remoteLog === null ? getCurrentRemoteLogLines() : remoteLog.map(line => `PAGE ${line}`);
  els.log.textContent = [...localLog, ...remote].slice(-160).join("\n");
  els.log.scrollTop = els.log.scrollHeight;
}

function getCurrentRemoteLogLines() {
  return els.log.textContent
    .split("\n")
    .filter(line => line.startsWith("PAGE "));
}

function countMedia(items) {
  return items.reduce((sum, item) => sum + item.mediaFiles.length, 0);
}

function totalMediaBytes(items) {
  return items.reduce((sum, item) => sum + item.mediaFiles.reduce((inner, file) => inner + file.size, 0), 0);
}

function parseDateTimeLocal(value) {
  if (!value) return null;
  const normalized = String(value).trim();
  const match = normalized.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:T|\s+)(\d{1,2}):(\d{2})$/);
  if (match) {
    const [, y, m, d, hh, mm] = match.map(Number);
    const date = new Date(y, m - 1, d, hh, mm, 0, 0);
    return isMatchingDate(date, y, m, d, hh, mm) ? date : null;
  }
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseHumanDateTime(value) {
  const normalized = String(value || "").trim().replace("T", " ");
  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})$/);
  if (!match) throw new Error(`时间格式无效：${value}`);
  const [, y, m, d, hh, mm] = match.map(Number);
  const date = new Date(y, m - 1, d, hh, mm, 0, 0);
  if (!isMatchingDate(date, y, m, d, hh, mm)) {
    throw new Error(`时间不存在：${value}`);
  }
  return date;
}

function isMatchingDate(date, y, m, d, hh, mm) {
  return date.getFullYear() === y
    && date.getMonth() === m - 1
    && date.getDate() === d
    && date.getHours() === hh
    && date.getMinutes() === mm;
}

function sameMinute(left, right) {
  if (!(left instanceof Date) || !(right instanceof Date)) return false;
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate()
    && left.getHours() === right.getHours()
    && left.getMinutes() === right.getMinutes();
}

function toDateTimeLocal(date) {
  const pad = number => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toDateTimePlaceholderFormat(value) {
  const date = value instanceof Date ? value : parseDateTimeLocal(value);
  if (!date) return String(value || "");
  const pad = number => String(number).padStart(2, "0");
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDateTime(date) {
  const pad = number => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function inferMimeType(name) {
  const lower = String(name || "").toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".webm")) return "video/webm";
  return "application/octet-stream";
}

function mimeExtension(type) {
  if (type === "image/jpeg") return "jpg";
  if (type === "image/webp") return "webp";
  if (type === "image/gif") return "gif";
  return "png";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}
