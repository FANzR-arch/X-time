const STORAGE_KEYS = {
  source: "xns.popup.source",
  options: "xns.popup.options",
  queue: "xns.popup.queue",
  runState: "xns.runState"
};

const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
const X_LOGO_HTML = '<img class="x-logo" src="assets/twitter-x-seeklogo.svg" alt="" aria-hidden="true">';

const els = {
  importQueue: document.getElementById("importQueue"),
  chooseMediaInline: document.getElementById("chooseMediaInline"),
  emojiButton: document.getElementById("emojiButton"),
  emojiPanel: document.getElementById("emojiPanel"),
  clearDraftTop: document.getElementById("clearDraftTop"),
  fileInput: document.getElementById("fileInput"),
  mediaInput: document.getElementById("mediaInput"),
  mediaList: document.getElementById("mediaList"),
  manualMediaPreview: document.getElementById("manualMediaPreview"),
  queueCount: document.getElementById("queueCount"),
  charCount: document.getElementById("charCount"),
  source: document.getElementById("source"),
  manualScheduledAt: document.getElementById("manualScheduledAt"),
  startAt: document.getElementById("startAt"),
  endAt: document.getElementById("endAt"),
  intervalMinutes: document.getElementById("intervalMinutes"),
  delaySeconds: document.getElementById("delaySeconds"),
  preview: document.getElementById("preview"),
  save: document.getElementById("save"),
  start: document.getElementById("start"),
  stop: document.getElementById("stop"),
  openX: document.getElementById("openX"),
  status: document.getElementById("status"),
  previewList: document.getElementById("previewList"),
  log: document.getElementById("log")
};

let selectedMediaFiles = new Map();
let queuedPosts = [];
let manualMediaRefs = [];
let lastItems = [];
let localLog = [];
let persistTimer = null;
let pastedMediaCounter = 0;
let editingQueueIndex = null;
let activeEmojiCategory = "";
let previewMediaUrls = [];

init();

async function init() {
  setDefaultTimes();
  await restoreState();
  bindEvents();
  renderEmojiPanel();
  renderManualMediaPreview();
  renderMediaList();
  renderQueue({ validateMedia: false, silent: true });
  updateComposerState();
  await renderRunState();
  pollRunState();
}

function bindEvents() {
  els.importQueue.addEventListener("click", () => els.fileInput.click());
  els.chooseMediaInline.addEventListener("click", () => {
    els.mediaInput.dataset.attachToDraft = "1";
    els.mediaInput.click();
  });
  els.emojiButton.addEventListener("click", (event) => {
    const isOpen = els.emojiPanel.classList.toggle("open");
    if (isOpen) {
      const btnRect = event.currentTarget.getBoundingClientRect();
      const panelW = els.emojiPanel.offsetWidth || 308;
      const gap = 6;
      let left = btnRect.right - panelW + gap;
      let top = btnRect.bottom + gap;
      // Keep panel within viewport
      if (left < 8) left = 8;
      if (left + panelW > window.innerWidth - 8) left = window.innerWidth - panelW - 8;
      if (top + 280 > window.innerHeight) top = btnRect.top - 280 - gap;
      if (top < 8) top = 8;
      els.emojiPanel.style.left = `${left}px`;
      els.emojiPanel.style.top = `${top}px`;
    }
  });
  els.clearDraftTop.addEventListener("click", () => clearDraft());
  els.fileInput.addEventListener("change", importFile);
  els.mediaInput.addEventListener("change", importMediaFiles);
  els.preview.addEventListener("click", previewQueue);
  els.save.addEventListener("click", saveState);
  els.start.addEventListener("click", startQueue);
  els.stop.addEventListener("click", stopQueue);
  els.openX.addEventListener("click", () => chrome.tabs.create({ url: "https://x.com/home" }));

  els.source.addEventListener("input", () => {
    updateComposerState();
    schedulePersistState();
  });
  els.source.addEventListener("paste", handleSourcePaste);

  els.manualScheduledAt.addEventListener("change", () => {
    schedulePersistState();
    updateComposerState();
  });

  for (const input of [els.startAt, els.endAt, els.intervalMinutes, els.delaySeconds]) {
    input.addEventListener("change", () => {
      renderQueue({ validateMedia: false, silent: true });
      schedulePersistState();
    });
  }

  els.emojiPanel.addEventListener("click", event => {
    const categoryButton = event.target.closest("[data-emoji-category]");
    if (categoryButton) {
      renderEmojiPanel(categoryButton.dataset.emojiCategory);
      return;
    }

    const button = event.target.closest("[data-emoji]");
    if (!button) return;
    insertAtCursor(button.dataset.emoji);
    els.emojiPanel.classList.remove("open");
  });

  document.addEventListener("click", event => {
    if (event.target === els.emojiButton || els.emojiPanel.contains(event.target)) return;
    els.emojiPanel.classList.remove("open");
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
    if (areaName === "local" && changes[STORAGE_KEYS.runState]) {
      renderRunState(changes[STORAGE_KEYS.runState].newValue);
    }
  });
}

async function restoreState() {
  const saved = await chrome.storage.local.get([STORAGE_KEYS.source, STORAGE_KEYS.options, STORAGE_KEYS.queue]);
  if (saved[STORAGE_KEYS.source]) els.source.value = saved[STORAGE_KEYS.source];

  const options = saved[STORAGE_KEYS.options] || {};
  if (options.manualScheduledAt) els.manualScheduledAt.value = toDateTimePlaceholderFormat(options.manualScheduledAt);
  if (options.startAt) els.startAt.value = options.startAt;
  if (options.endAt) els.endAt.value = options.endAt;
  if (options.intervalMinutes) els.intervalMinutes.value = options.intervalMinutes;
  if (options.delaySeconds) els.delaySeconds.value = options.delaySeconds;

  queuedPosts = Array.isArray(saved[STORAGE_KEYS.queue])
    ? saved[STORAGE_KEYS.queue].map(hydratePost).filter(Boolean)
    : [];
}

function setDefaultTimes() {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(9, 0, 0, 0);
  const end = new Date(start.getTime());
  end.setHours(18, 0, 0, 0);
  els.startAt.value = toDateTimeLocal(start);
  els.endAt.value = toDateTimeLocal(end);
}

async function persistState() {
  await chrome.storage.local.set({
    [STORAGE_KEYS.source]: els.source.value,
    [STORAGE_KEYS.options]: getOptions(),
    [STORAGE_KEYS.queue]: queuedPosts.map(serializePost)
  });
}

function schedulePersistState() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(persistState, 250);
}

async function importFile(event) {
  const file = event.target.files && event.target.files[0];
  els.fileInput.value = "";
  if (!file) return;

  let importedPosts;
  try {
    const text = await file.text();
    importedPosts = parseSource(text).map((post, index) => normalizeImportedPost(post, index));
    if (!importedPosts.length) throw new Error("文件中未识别到任何帖子。");
    schedulePosts(importedPosts, { validateMedia: false });
  } catch (error) {
    addLocalLog(`导入失败：${error.message}`);
    setError(error.message);
    return;
  }

  queuedPosts = importedPosts;
  clearDraft({ silent: true });
  await persistState();
  renderQueue({ validateMedia: false });
  addLocalLog(`已导入 ${file.name}，识别 ${queuedPosts.length} 条，${formatBytes(file.size)}`);

  try {
    schedulePosts(queuedPosts, { validateMedia: true });
    setStatus(`已导入 ${queuedPosts.length} 条帖子并自动排期。`);
  } catch (error) {
    setError(error.message);
    addLocalLog(`导入完成，媒体校验提醒：${error.message}`);
  }
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
    addLocalLog(`保存并自动排期：${queuedPosts.length} 条。`);
    setStatus(hasDraft ? `草稿已保存，队列共 ${queuedPosts.length} 条。点击「开始」即可发布。` : `已重新排期：${queuedPosts.length} 条。`);
  } catch (error) {
    addLocalLog(`保存完成，媒体校验提醒：${error.message}`);
    setError(error.message);
  }
}

function previewQueue() {
  if (els.source.value.trim()) {
    setError("当前草稿尚未保存。请先保存至队列后再预览或开始。");
    return;
  }

  try {
    renderQueue({ validateMedia: true });
    addLocalLog(`预览通过：${queuedPosts.length} 条。`);
    setStatus(`预览通过：${queuedPosts.length} 条。`);
  } catch (error) {
    addLocalLog(`预览失败：${error.message}`);
    setError(error.message);
  }
}

async function startQueue() {
  if (els.source.value.trim()) {
    setError("当前草稿尚未保存。请先保存后再开始。");
    return;
  }

  let items;
  try {
    items = schedulePosts(queuedPosts, { validateMedia: true });
    if (!items.length) throw new Error("队列为空。请先保存帖子或导入文件。");
  } catch (error) {
    addLocalLog(`构建队列失败：${error.message}`);
    setError(error.message);
    return;
  }

  addLocalLog(`准备开始：${items.length} 条，媒体 ${countMedia(items)} 个，总媒体大小 ${formatBytes(totalMediaBytes(items))}`);
  const tab = await getActiveXTab();
  if (!tab) {
    addLocalLog("未找到 x.com / twitter.com 标签页。");
    setError("请先打开已登录的 x.com/home 标签页，再点击开始。");
    return;
  }

  addLocalLog(`目标标签页：${tab.url || "(unknown url)"}`);
  try {
    await ensureContentScript(tab.id);
  } catch (error) {
    addLocalLog(`页面脚本注入失败：${error.message || String(error)}`);
    setError("无法向 X 页面注入脚本。请刷新 x.com 页面，或确认扩展有 x.com 访问权限。");
    return;
  }

  await persistState();
  renderPreview(items);
  setStatus("正在准备媒体并发送队列，请不要关闭这个窗口。");

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
    addLocalLog("发送队列到 x.com 页面脚本。");
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "xns-start-queue",
      items: outboundItems,
      options: {
        delayMs: Math.max(600, Number(els.delaySeconds.value || 1.2) * 1000)
      }
    });

    if (!response || !response.ok) {
      addLocalLog(`页面脚本拒绝：${response?.error || "无响应内容"}`);
      setError(response?.error || "X 页面没有接受队列。请刷新 x.com 后重试。");
      return;
    }

    addLocalLog("页面脚本已接受队列，开始执行。");
    setStatus("队列已发送到 X 页面执行。请保持 x.com 标签页打开。");
  } catch (error) {
    addLocalLog(`发送失败：${error.message || String(error)}`);
    setError("页面脚本未响应，或媒体数据过大。请刷新 x.com 后重试；大视频建议用 Playwright CLI。");
  }
}

async function stopQueue() {
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

function createManualPost(existingPost = null) {
  const text = els.source.value.trim();
  if (!text && !manualMediaRefs.length) throw new Error("当前草稿为空。");

  const manualDate = els.manualScheduledAt.value ? parseDateTimeLocal(els.manualScheduledAt.value) : null;
  if (els.manualScheduledAt.value && !manualDate) throw new Error("当前草稿时间无效。");

  return {
    id: existingPost?.id || nextQueuedPostId(),
    text,
    scheduledAt: manualDate,
    lockedTime: Boolean(manualDate),
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

function schedulePosts(posts, { validateMedia = true } = {}) {
  if (!posts.length) return [];

  const options = getOptions();
  const mode = "smart";
  const intervalMs = Math.max(1, Number(options.intervalMinutes || 60)) * 60 * 1000;
  let nextAutoTime = parseDateTimeLocal(options.startAt);
  let nextFallbackTime = new Date(Date.now() + 10 * 60 * 1000);
  const endAt = parseDateTimeLocal(options.endAt);

  if (!nextAutoTime && posts.some(post => !post.scheduledAt || (mode === "auto" && !post.lockedTime))) {
    throw new Error("需要设置自动排期开始时间。");
  }

  const now = Date.now();
  const items = posts.map((post, index) => {
    const text = String(post.text || "").trim();
    if (!text && !(post.mediaRefs || []).length) throw new Error(`第 ${index + 1} 条内容为空。`);

    let date = post.scheduledAt;
    if (mode === "document" && post.sourceType === "import" && !date) {
      throw new Error(`第 ${index + 1} 条缺少 scheduled_at。`);
    }
    if (mode === "auto" && !post.lockedTime) date = null;
    if (!date) {
      date = nextAutoTime;
      nextAutoTime = new Date(nextAutoTime.getTime() + intervalMs);
    }
    if (!date || Number.isNaN(date.getTime())) throw new Error(`第 ${index + 1} 条时间无效。`);

    let scheduleNote = "";
    if (date.getTime() <= now + 60_000) {
      date = nextFallbackTime;
      nextFallbackTime = new Date(nextFallbackTime.getTime() + intervalMs);
      scheduleNote = "已过期，自动顺延";
    }
    if (endAt && date.getTime() > endAt.getTime()) {
      date = nextFallbackTime;
      nextFallbackTime = new Date(nextFallbackTime.getTime() + intervalMs);
      scheduleNote = "超出时段，自动顺延";
    }

    const mediaFiles = validateMedia ? resolveMediaFiles(post, index) : collectAvailableMediaFiles(post);
    if (validateMedia) validateMediaSet(mediaFiles, index);

    return {
      id: post.id || `post-${String(index + 1).padStart(3, "0")}`,
      text,
      date,
      queueIndex: index,
      scheduleNote,
      mediaRefs: [...(post.mediaRefs || [])],
      mediaFiles
    };
  });

  return items.sort((a, b) => a.date.getTime() - b.date.getTime());
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

function renderQueue({ validateMedia = false, silent = false } = {}) {
  let items = [];
  try {
    items = schedulePosts(queuedPosts, { validateMedia });
    lastItems = items;
    renderPreview(items);
    updateQueueCount(items.length);
  } catch (error) {
    renderPreview(lastItems);
    updateQueueCount(queuedPosts.length);
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
    const note = item.scheduleNote ? `<span class="pill warning-pill">${escapeHtml(item.scheduleNote)}</span>` : "";
    const editingClass = editingQueueIndex === item.queueIndex ? " is-editing" : "";
    return `
      <article class="preview-item${editingClass}" data-edit-queue-index="${item.queueIndex}">
        <div class="avatar">${X_LOGO_HTML}</div>
        <div>
          <div class="tweet-head">
            <div class="account">X Scheduler <span>@queue · 已排期</span></div>
            <div class="time-badge">${formatDateTime(item.date)}</div>
          </div>
          <div class="tweet-body">${escapeHtml(item.text)}</div>
          ${renderPreviewMedia(item.mediaFiles)}
          <div class="pill-row">
            <span class="pill">${item.text.length} 字</span>
            <span class="pill">${escapeHtml(item.id)}</span>
            <span class="pill">${media}</span>
            ${note}
          </div>
          <div class="tweet-actions">
            <span>回复</span>
            <span>转发</span>
            <span>喜欢</span>
            <span>${index + 1}/${items.length}</span>
            <button class="preview-delete" type="button" data-delete-queue-index="${item.queueIndex}">删除</button>
          </div>
        </div>
      </article>
    `;
  }).join("");
}

function renderEmptyPreview(message = "保存草稿或导入文件后，队列将显示在此处。") {
  clearPreviewMediaUrls();
  els.previewList.innerHTML = `
    <div class="empty-state">
      <strong>暂无排期预览</strong>
      <span>${escapeHtml(message)}</span>
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
  updateQueueCount(queuedPosts.length);
  autoResizeTextarea();
}

function autoResizeTextarea() {
  const el = els.source;
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, 400)}px`;
}

function renderEmojiPanel(nextCategoryId = "") {
  const categories = Array.isArray(window.XNS_EMOJI_CATEGORIES) ? window.XNS_EMOJI_CATEGORIES : [];
  if (!categories.length) {
    els.emojiPanel.innerHTML = `<div class="empty-state"><strong>暂无 emoji</strong><span>emoji 数据文件未加载。</span></div>`;
    return;
  }

  const activeCategory = categories.find(category => category.id === nextCategoryId)
    || categories.find(category => category.id === activeEmojiCategory)
    || categories[0];
  activeEmojiCategory = activeCategory.id;

  els.emojiPanel.innerHTML = `
    <div class="emoji-tabs">
      ${categories.map(category => `
        <button
          class="emoji-tab${category.id === activeCategory.id ? " active" : ""}"
          type="button"
          title="${escapeHtml(category.label)}"
          data-emoji-category="${escapeHtml(category.id)}"
        >${category.icon}</button>
      `).join("")}
    </div>
    <div class="emoji-grid">
      ${activeCategory.items.map(emoji => `
        <button type="button" data-emoji="${escapeHtml(emoji)}">${emoji}</button>
      `).join("")}
    </div>
  `;
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

function updateQueueCount(count = queuedPosts.length) {
  els.queueCount.textContent = `${count} 条`;
}

function clearDraft({ silent = false } = {}) {
  els.source.value = "";
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
  if (!Number.isInteger(queueIndex) || queueIndex < 0 || queueIndex >= queuedPosts.length) return;
  const [removed] = queuedPosts.splice(queueIndex, 1);
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
  setStatus(`已删除 1 条帖子，队列剩余 ${queuedPosts.length} 条。`);
}

function loadQueuedPostForEdit(queueIndex) {
  if (!Number.isInteger(queueIndex) || queueIndex < 0 || queueIndex >= queuedPosts.length) return;
  const post = queuedPosts[queueIndex];
  const scheduledItem = schedulePosts(queuedPosts, { validateMedia: false })
    .find(item => item.queueIndex === queueIndex);

  editingQueueIndex = queueIndex;
  els.source.value = post.text || "";
  els.manualScheduledAt.value = toDateTimePlaceholderFormat(post.scheduledAt || scheduledItem?.date || new Date());
  manualMediaRefs = [...(post.mediaRefs || [])];
  renderManualMediaPreview();
  renderQueue({ validateMedia: false, silent: true });
  updateComposerState();
  schedulePersistState();
  setStatus(`正在编辑 ${post.id || `第 ${queueIndex + 1} 条`}，保存后会替换右侧原帖。`);
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
    sourceType: post.sourceType || "import"
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
    sourceType: post.sourceType || "import"
  };
}

async function prepareOutboundItems(items) {
  return Promise.all(items.map(async item => ({
    id: item.id,
    text: item.text,
    dateMs: item.date.getTime(),
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
    files: ["content.js"]
  });

  const response = await chrome.tabs.sendMessage(tabId, { type: "xns-get-status" });
  if (!response || !response.ok) throw new Error("注入后页面脚本仍未响应。");
  addLocalLog("页面脚本主动注入成功。");
}

function parseSource(raw) {
  const text = String(raw || "").trim();
  if (!text) return [];

  if (/^---\s*post\s*---\s*$/im.test(text)) {
    return parsePostBlocks(text);
  }

  return parseLoosePosts(text);
}

function parsePostBlocks(raw) {
  const chunks = raw
    .split(/^---\s*post\s*---\s*$/gim)
    .slice(1)
    .map(chunk => chunk.trim())
    .filter(Boolean);

  return chunks.map((chunk, index) => parseSingleBlock(chunk, index));
}

function parseSingleBlock(chunk, index) {
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
  return {
    id: meta.id || `post-${String(index + 1).padStart(3, "0")}`,
    scheduledAt: scheduled ? parseHumanDateTime(scheduled) : null,
    mediaRefs,
    text: body
  };
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

function getOptions() {
  return {
    manualScheduledAt: els.manualScheduledAt.value,
    startAt: els.startAt.value,
    endAt: els.endAt.value,
    intervalMinutes: els.intervalMinutes.value,
    delaySeconds: els.delaySeconds.value
  };
}

async function renderRunState(runState) {
  const state = runState || (await chrome.storage.local.get(STORAGE_KEYS.runState))[STORAGE_KEYS.runState];
  if (!state) return;

  const showProgress = state.status === "running" && state.progress;
  const progress = showProgress ? `${state.progress.current || 0}/${state.progress.total || 0}` : "";
  const statusType = state.status === "error" ? "error" : state.status === "done" ? "success" : "info";
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
