"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright-core");

const rootDir = path.resolve(__dirname, "..");
const authPath = path.join(rootDir, "auth", "x-auth.json");
const defaultPostsPath = path.join(rootDir, "data", "posts.json");
const timezoneId = process.env.X_TIMEZONE || "Asia/Shanghai";
const locale = process.env.X_LOCALE || "en-US";
const minDelayMs = Number(process.env.MIN_DELAY_MS || 2000);
const maxDelayMs = Number(process.env.MAX_DELAY_MS || 8000);

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const postsPath = path.resolve(args.file || defaultPostsPath);
  const dryRun = args.flags.has("dry-run");
  const includeDone = args.flags.has("include-done");
  const noSort = args.flags.has("no-sort");

  if (!fs.existsSync(authPath) && !dryRun) {
    throw new Error(`缺少登录态 ${authPath}。请先运行 npm run login。`);
  }

  const doc = readPostsDocument(postsPath);
  const posts = normalizePosts(doc.list, postsPath)
    .map((post, index) => ({ ...post, sourceIndex: index }))
    .filter((post) => includeDone || post.status !== "scheduled");

  if (!posts.length) {
    console.log("没有需要处理的帖子。");
    return;
  }

  if (!noSort) posts.sort((a, b) => a.scheduledDate.getTime() - b.scheduledDate.getTime());
  console.log(`准备处理 ${posts.length} 条。`);

  if (dryRun) {
    for (const post of posts) {
      console.log(`[DRY] ${post.id || post.sourceIndex} ${formatParts(post.parts)} ${post.text.slice(0, 60)}`);
    }
    return;
  }

  const browser = await launchInstalledBrowser({ headless: process.env.HEADLESS === "1" });
  const context = await browser.newContext({
    storageState: authPath,
    viewport: { width: 1365, height: 900 },
    locale,
    timezoneId
  });
  const page = await context.newPage();

  try {
    for (let i = 0; i < posts.length; i += 1) {
      const post = posts[i];
      console.log(`\n[${i + 1}/${posts.length}] ${post.id || post.sourceIndex} -> ${formatParts(post.parts)}`);
      await schedulePost(page, post);
      markScheduled(doc.raw, post.sourceIndex, postsPath);
      await context.storageState({ path: authPath });
      const delay = randomDelay();
      console.log(`已排入 X 原生定时流程，等待 ${Math.round(delay / 1000)} 秒处理下一条。`);
      await page.waitForTimeout(delay);
    }
  } finally {
    await browser.close();
  }
}

async function schedulePost(page, post) {
  await openComposer(page);
  const editor = page.locator('[data-testid="tweetTextarea_0"]').first();
  await editor.waitFor({ state: "visible", timeout: 15000 });
  await clearAndFillEditor(editor, post.text);

  if (post.media.length) {
    await uploadMedia(page, post.media);
  }

  await openScheduleDialog(page);
  await setScheduleDateTime(page, post.parts);
  await confirmScheduleDialog(page);
  await clickFinalSchedule(page);
  await page.waitForTimeout(2500);
}

async function openComposer(page) {
  await page.goto("https://x.com/home", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);

  const existingEditor = page.locator('[data-testid="tweetTextarea_0"]').first();
  if (await isVisible(existingEditor, 800)) return;

  const compose = page.locator('[data-testid="SideNav_NewTweet_Button"], a[href="/compose/post"], a[href*="/compose/post"]').first();
  if (await isVisible(compose, 3000)) {
    await compose.click();
  } else {
    await page.goto("https://x.com/compose/post", { waitUntil: "domcontentloaded" });
  }

  await page.locator('[data-testid="tweetTextarea_0"]').first().waitFor({ state: "visible", timeout: 15000 });
}

async function clearAndFillEditor(editor, text) {
  const current = await editor.innerText().catch(() => "");
  if (current.trim()) {
    throw new Error("发帖框已有内容。请先清空或关闭草稿后再运行。");
  }

  await editor.click();
  try {
    await editor.fill(text, { timeout: 5000 });
  } catch {
    await editor.evaluate((node, value) => {
      node.focus();
      document.execCommand("insertText", false, value);
      node.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
    }, text);
  }

  await expectEditorHasText(editor);
}

async function expectEditorHasText(editor) {
  const started = Date.now();
  while (Date.now() - started < 5000) {
    const text = await editor.innerText().catch(() => "");
    if (text.trim()) return;
    await editor.page().waitForTimeout(150);
  }
  throw new Error("未能写入帖子内容。");
}

async function uploadMedia(page, mediaFiles) {
  const input = page.locator('input[type="file"]').first();
  await input.setInputFiles(mediaFiles, { timeout: 10000 });
  await page.waitForTimeout(3500 + mediaFiles.length * 1000);
}

async function openScheduleDialog(page) {
  const scheduleButton = page.locator('[data-testid="scheduleOption"]').first();
  if (await isVisible(scheduleButton, 5000)) {
    await scheduleButton.click();
  } else {
    await clickButtonByText(page, /schedule|定时|安排|排程/i, "找不到 X 原生日历/定时按钮");
  }

  await page.locator('[role="dialog"]').last().waitFor({ state: "visible", timeout: 10000 });
}

async function setScheduleDateTime(page, parts) {
  const dialog = page.locator('[role="dialog"]').last();
  const selects = dialog.locator("select");
  const count = await selects.count();

  if (count >= 5) {
    await selectMeaning(selects.nth(0), parts.month, "month");
    await selectMeaning(selects.nth(1), parts.day, "day");
    await selectMeaning(selects.nth(2), parts.year, "year");
    if (count >= 6) {
      await selectMeaning(selects.nth(3), to12Hour(parts.hour), "hour");
      await selectMeaning(selects.nth(4), parts.minute, "minute");
      await selectMeaning(selects.nth(5), parts.hour >= 12 ? "PM" : "AM", "ampm");
    } else {
      await selectMeaning(selects.nth(3), parts.hour, "hour");
      await selectMeaning(selects.nth(4), parts.minute, "minute");
    }
    return;
  }

  throw new Error("无法识别 X 定时弹窗里的日期时间控件。X 可能改版，需要更新选择器。");
}

async function selectMeaning(selectLocator, value, kind) {
  const result = await selectLocator.evaluate(({ options }, payload) => {
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
    const wanted = String(payload.value);
    const padded = wanted.padStart(2, "0");
    const numeric = Number(payload.value);
    const opts = Array.from(options);
    const match = opts.find((option) => {
      const haystack = `${option.value} ${option.textContent}`.trim().toLowerCase();
      const digits = (haystack.match(/\d+/g) || []).map(Number);

      if (payload.kind === "ampm") {
        const isPm = String(payload.value).toUpperCase() === "PM";
        return isPm ? /\bpm\b|下午|晚上/.test(haystack) : /\bam\b|上午|凌晨|早上/.test(haystack);
      }

      if (payload.kind === "month") {
        const names = monthNames[numeric - 1] || [];
        if (names.some((name) => haystack.includes(name))) return true;
        if (/月/.test(haystack) && digits.includes(numeric)) return true;
      }

      if (haystack === wanted || haystack === padded) return true;
      if (option.value === wanted || option.value === padded) return true;
      return digits.includes(numeric);
    });

    if (!match) return null;
    const select = options.length ? options[0].parentElement : null;
    if (!select) return null;
    select.value = match.value;
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return { value: match.value, text: match.textContent };
  }, { value, kind });

  if (!result) throw new Error(`无法设置 ${kind}=${value}，没有匹配选项。`);
}

async function confirmScheduleDialog(page) {
  const dialog = page.locator('[role="dialog"]').last();
  const primary = dialog.locator('[data-testid="scheduledConfirmationPrimaryAction"]').first();
  if (await isVisible(primary, 3000)) {
    await primary.click();
  } else {
    await clickButtonByText(dialog, /confirm|done|确认|确定|完成/i, "找不到定时弹窗确认按钮");
  }
  await page.waitForTimeout(800);
}

async function clickFinalSchedule(page) {
  const finalByText = page.getByRole("button", { name: /schedule|定时发送|安排|排程/i }).last();
  if (await isVisible(finalByText, 3000) && !(await isDisabled(finalByText))) {
    await finalByText.click();
    return;
  }

  const finalByTestId = page.locator('[data-testid="tweetButton"], [data-testid="tweetButtonInline"]').last();
  await finalByTestId.waitFor({ state: "visible", timeout: 10000 });
  if (await isDisabled(finalByTestId)) throw new Error("最终 Schedule 按钮不可用。");
  await finalByTestId.click();
}

async function clickButtonByText(scope, regex, message) {
  const button = scope.getByRole("button", { name: regex }).first();
  if (!(await isVisible(button, 5000))) throw new Error(message);
  if (await isDisabled(button)) throw new Error(`${message}：按钮不可用`);
  await button.click();
}

async function isVisible(locator, timeout = 1000) {
  try {
    await locator.waitFor({ state: "visible", timeout });
    return true;
  } catch {
    return false;
  }
}

async function isDisabled(locator) {
  return await locator.evaluate((node) => node.disabled || node.getAttribute("aria-disabled") === "true").catch(() => true);
}

function readPostsDocument(postsPath) {
  if (!fs.existsSync(postsPath)) {
    throw new Error(`找不到 posts 文件：${postsPath}`);
  }
  const rawText = fs.readFileSync(postsPath, "utf8");
  const raw = JSON.parse(rawText);
  const list = Array.isArray(raw) ? raw : raw.posts;
  if (!Array.isArray(list)) throw new Error("posts 文件必须是数组，或包含 posts 数组。");
  return { raw, list };
}

function normalizePosts(posts, postsPath) {
  const baseDir = path.dirname(postsPath);
  return posts.map((post, index) => {
    if (!post || typeof post !== "object") throw new Error(`第 ${index + 1} 条不是对象。`);
    const text = String(post.text || "").trim();
    const id = post.id || `post-${String(index + 1).padStart(3, "0")}`;
    if (!text) throw new Error(`${id} 缺少 text。`);
    if (text.length > 280 && !post.allow_long_text) {
      throw new Error(`${id} 超过 280 字符。X 网页原生长文定时不稳定；如确认要尝试，给该条加 allow_long_text: true。`);
    }

    const scheduledDate = parseScheduledAt(post.scheduled_at);
    if (!scheduledDate || Number.isNaN(scheduledDate.getTime())) throw new Error(`${id} scheduled_at 无效。`);
    if (scheduledDate.getTime() <= Date.now() + 60_000) throw new Error(`${id} scheduled_at 必须晚于当前时间至少 1 分钟。`);

    const media = Array.isArray(post.media) ? post.media.map((file) => {
      const resolved = path.isAbsolute(file) ? file : path.resolve(baseDir, file);
      if (!fs.existsSync(resolved)) throw new Error(`${id} 媒体文件不存在：${resolved}`);
      return resolved;
    }) : [];

    return {
      id,
      text,
      media,
      status: post.status,
      scheduledDate,
      parts: datePartsInTimezone(scheduledDate, timezoneId)
    };
  });
}

function parseScheduledAt(value) {
  if (!value) return null;
  const text = String(value).trim();
  const isoLike = text.includes("T") ? text : text.replace(" ", "T");
  const date = new Date(isoLike);
  if (!Number.isNaN(date.getTime())) return date;

  const match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match.map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

function datePartsInTimezone(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  const values = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") values[part.type] = Number(part.value);
  }
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour === 24 ? 0 : values.hour,
    minute: values.minute
  };
}

function markScheduled(raw, sourceIndex, postsPath) {
  const list = Array.isArray(raw) ? raw : raw.posts;
  const item = list[sourceIndex];
  item.status = "scheduled";
  item.scheduled_by = "x-native-scheduler-playwright";
  item.scheduled_recorded_at = new Date().toISOString();
  fs.writeFileSync(postsPath, `${JSON.stringify(raw, null, 2)}\n`, "utf8");
}

async function launchInstalledBrowser({ headless }) {
  const slowMo = Number(process.env.SLOW_MO_MS || 80);
  const candidates = [];
  if (process.env.CHROME_PATH) candidates.push({ executablePath: process.env.CHROME_PATH });
  if (process.env.BROWSER_CHANNEL) candidates.push({ channel: process.env.BROWSER_CHANNEL });
  candidates.push({ channel: "chrome" }, { channel: "msedge" });

  let lastError;
  for (const candidate of candidates) {
    try {
      return await chromium.launch({ ...candidate, headless, slowMo });
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`找不到可控制的 Chrome/Edge。可设置 CHROME_PATH 指向浏览器 exe。最后错误：${lastError && lastError.message}`);
}

function parseArgs(argv) {
  const flags = new Set();
  let file = "";
  for (const arg of argv) {
    if (arg.startsWith("--")) flags.add(arg.slice(2));
    else if (!file) file = arg;
  }
  return { file, flags };
}

function randomDelay() {
  const min = Math.max(0, minDelayMs);
  const max = Math.max(min, maxDelayMs);
  return min + Math.floor(Math.random() * (max - min + 1));
}

function to12Hour(hour24) {
  return hour24 % 12 || 12;
}

function formatParts(parts) {
  const pad = (number) => String(number).padStart(2, "0");
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)} ${pad(parts.hour)}:${pad(parts.minute)} ${timezoneId}`;
}

main().catch((error) => {
  console.error(`\n调度脚本失败：${error.message}`);
  process.exit(1);
});
