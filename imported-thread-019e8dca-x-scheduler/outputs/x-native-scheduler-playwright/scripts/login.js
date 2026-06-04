"use strict";

const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline/promises");
const { stdin, stdout } = require("node:process");
const { chromium } = require("playwright-core");

const rootDir = path.resolve(__dirname, "..");
const authPath = path.join(rootDir, "auth", "x-auth.json");
const timezoneId = process.env.X_TIMEZONE || "Asia/Shanghai";
const locale = process.env.X_LOCALE || "en-US";

async function main() {
  fs.mkdirSync(path.dirname(authPath), { recursive: true });
  const browser = await launchInstalledBrowser({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1365, height: 900 },
    locale,
    timezoneId
  });
  const page = await context.newPage();

  await page.goto("https://x.com/home", { waitUntil: "domcontentloaded" });
  console.log("\n请在打开的浏览器窗口里完成 X 登录。");
  console.log("登录后确认能看到主页和发帖按钮，然后回到这个终端按 Enter。");

  const rl = readline.createInterface({ input: stdin, output: stdout });
  await rl.question("\n登录完成后按 Enter 保存本地 session...");
  rl.close();

  await context.storageState({ path: authPath });
  await browser.close();
  console.log(`\n已保存登录态：${authPath}`);
  console.log("这个文件包含本地登录 cookie，请不要分享给别人。");
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
      return await chromium.launch({
        ...candidate,
        headless,
        slowMo
      });
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(`找不到可控制的 Chrome/Edge。可设置 CHROME_PATH 指向浏览器 exe。最后错误：${lastError && lastError.message}`);
}

main().catch((error) => {
  console.error(`\n登录脚本失败：${error.message}`);
  process.exit(1);
});
