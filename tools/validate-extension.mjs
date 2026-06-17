import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const extensionDir = join(rootDir, "x-native-scheduler-test-plugin");
const zipPath = join(rootDir, "x-native-scheduler-test-plugin.zip");
const errors = [];

main();

function main() {
  assertExists(extensionDir, "extension directory");
  validateManifest();
  validateJavaScriptSyntax();
  validatePopupResources();
  validateZipFreshness();

  if (errors.length) {
    for (const error of errors) console.error(`FAIL ${error}`);
    process.exit(1);
  }

  console.log("OK extension validation passed");
}

function validateManifest() {
  const manifestPath = join(extensionDir, "manifest.json");
  assertExists(manifestPath, "manifest.json");

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    errors.push(`manifest.json is not valid JSON: ${error.message}`);
    return;
  }

  if (manifest.manifest_version !== 3) errors.push("manifest_version must be 3");
  if (!manifest.background?.service_worker) errors.push("manifest background.service_worker is missing");

  const iconPaths = [
    ...Object.values(manifest.icons || {}),
    ...Object.values(manifest.action?.default_icon || {})
  ];
  for (const iconPath of iconPaths) assertExtensionFile(iconPath, "manifest icon");
  if (manifest.background?.service_worker) assertExtensionFile(manifest.background.service_worker, "service worker");

  for (const script of manifest.content_scripts || []) {
    for (const file of script.js || []) assertExtensionFile(file, "content script");
  }
}

function validateJavaScriptSyntax() {
  for (const file of ["background.js", "content.js", "popup.js", "timezone-core.js", "reply-core.js"]) {
    const absolute = join(extensionDir, file);
    assertExists(absolute, file);
    const result = spawnSync(process.execPath, ["--check", absolute], { encoding: "utf8" });
    if (result.status !== 0) {
      errors.push(`${file} failed node --check: ${(result.stderr || result.stdout).trim()}`);
    }
  }
}

function validatePopupResources() {
  const popupPath = join(extensionDir, "popup.html");
  const popupJsPath = join(extensionDir, "popup.js");
  assertExists(popupPath, "popup.html");
  assertExists(popupJsPath, "popup.js");

  const popupHtml = readFileSync(popupPath, "utf8");
  const timezoneScriptIndex = popupHtml.indexOf('<script src="timezone-core.js"></script>');
  const replyScriptIndex = popupHtml.indexOf('<script src="reply-core.js"></script>');
  const popupScriptIndex = popupHtml.indexOf('<script type="module" src="popup.js"></script>');
  if (timezoneScriptIndex < 0) errors.push("popup.html must load timezone-core.js");
  if (replyScriptIndex < 0) errors.push("popup.html must load reply-core.js");
  if (popupScriptIndex >= 0 && (timezoneScriptIndex > popupScriptIndex || replyScriptIndex > popupScriptIndex)) {
    errors.push("popup shared scripts must load before popup.js");
  }
  for (const match of popupHtml.matchAll(/\b(?:src|href|data-source)="([^"]+)"/g)) {
    assertExtensionFile(match[1], "popup resource");
  }
  for (const match of popupHtml.matchAll(/url\("([^"]+)"\)/g)) {
    assertExtensionFile(match[1], "css resource");
  }

  const popupJs = readFileSync(popupJsPath, "utf8");
  for (const match of popupJs.matchAll(/import\s+(?:(?:[^"']+)\s+from\s+)?["']([^"']+)["']/g)) {
    assertExtensionFile(match[1], "popup import");
  }
  for (const match of popupJs.matchAll(/\bsrc="([^"]+)"/g)) {
    assertExtensionFile(match[1], "popup js html resource");
  }

  const backgroundJs = readFileSync(join(extensionDir, "background.js"), "utf8");
  if (!backgroundJs.includes('importScripts("reply-core.js")')) {
    errors.push("background.js must import reply-core.js");
  }
}

function validateZipFreshness() {
  if (!existsSync(zipPath)) return;

  const zipMtime = statSync(zipPath).mtimeMs;
  const latest = latestFileMtime(extensionDir);
  if (zipMtime < latest.mtimeMs) {
    errors.push(`x-native-scheduler-test-plugin.zip is older than ${relative(latest.path)}`);
  }
}

function latestFileMtime(dir) {
  let latest = { path: dir, mtimeMs: 0 };
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absolute = join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = latestFileMtime(absolute);
      if (nested.mtimeMs > latest.mtimeMs) latest = nested;
      continue;
    }
    if (!entry.isFile()) continue;
    const mtimeMs = statSync(absolute).mtimeMs;
    if (mtimeMs > latest.mtimeMs) latest = { path: absolute, mtimeMs };
  }
  return latest;
}

function assertExtensionFile(resourcePath, label) {
  if (!resourcePath || isExternalResource(resourcePath)) return;
  const normalized = resourcePath.startsWith("./") ? resourcePath.slice(2) : resourcePath;
  assertExists(join(extensionDir, normalized), `${label}: ${resourcePath}`);
}

function assertExists(path, label) {
  if (!existsSync(path)) errors.push(`missing ${label}`);
}

function isExternalResource(resourcePath) {
  return resourcePath.includes("${") || /^(?:data:|https?:|chrome:|about:|blob:)/i.test(resourcePath);
}

function relative(path) {
  return path.replace(`${rootDir}\\`, "").replace(`${rootDir}/`, "");
}
