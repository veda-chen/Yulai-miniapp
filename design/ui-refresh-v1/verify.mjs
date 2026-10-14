import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const screenshots = path.join(root, "screenshots");
const chromeCandidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);
const chrome = chromeCandidates.find(existsSync);
if (!chrome)
  throw new Error("Set CHROME_PATH to a Chrome or Edge executable to capture the prototype.");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const port = await new Promise((resolve, reject) => {
  const server = createServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const assigned = server.address().port;
    server.close(() => resolve(assigned));
  });
});
const profile = await mkdtemp(path.join(os.tmpdir(), "yulai-ui-refresh-"));
const url = pathToFileURL(path.join(root, "index.html"));
const browser = spawn(
  chrome,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--hide-scrollbars",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    url.href,
  ],
  { stdio: "ignore", windowsHide: true },
);

let socket;
let id = 0;
const pending = new Map();
function command(method, params = {}) {
  return new Promise((resolve, reject) => {
    const commandId = ++id;
    const timeout = setTimeout(() => {
      pending.delete(commandId);
      reject(new Error(`CDP command timed out: ${method}`));
    }, 10000);
    pending.set(commandId, { resolve, reject, timeout });
    socket.send(JSON.stringify({ id: commandId, method, params }));
  });
}
async function evaluate(expression) {
  const { result, exceptionDetails } = await command("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true,
  });
  if (exceptionDetails) throw new Error(exceptionDetails.text);
  return result.value;
}
async function click(selector) {
  assert.equal(
    await evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`),
    true,
  );
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
}
async function setInput(selector, value) {
  await evaluate(`(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    input.value = ${JSON.stringify(value)};
    input.dispatchEvent(new Event("input", { bubbles: true }));
  })()`);
}
async function capture(name) {
  const overflow = await evaluate(`(() => {
    const phone = document.querySelector("#proposed-device .phone");
    return phone.scrollWidth > phone.clientWidth;
  })()`);
  assert.equal(overflow, false, `${name}: the proposed phone must not overflow horizontally`);
  const { data } = await command("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  await writeFile(path.join(screenshots, `${name}.png`), Buffer.from(data, "base64"));
}
async function setControls({
  page,
  width = 375,
  color = "blue",
  mode = "light",
  material = "glass",
  text = "standard",
}) {
  for (const [key, value] of Object.entries({ page, width, color, mode, material, text })) {
    await click(`[data-set="${key}"][data-value="${value}"]`);
  }
}

try {
  let target;
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      target = targets.find((item) => item.type === "page" && item.url.startsWith("file:"));
      if (target) break;
    } catch {}
    await wait(100);
  }
  if (!target) throw new Error("Could not connect to headless Chrome.");
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    const entry = pending.get(message.id);
    if (!entry) return;
    clearTimeout(entry.timeout);
    pending.delete(message.id);
    if (message.error) entry.reject(new Error(message.error.message));
    else entry.resolve(message.result);
  });
  await command("Runtime.enable");
  await command("Page.enable");
  await command("Emulation.setDeviceMetricsOverride", {
    width: 1530,
    height: 1130,
    deviceScaleFactor: 1,
    mobile: false,
  });
  for (let attempt = 0; attempt < 40; attempt++) {
    if (await evaluate('Boolean(document.querySelector("#proposed-device .phone"))')) break;
    await wait(100);
  }
  assert.equal(await evaluate('Boolean(document.querySelector("#proposed-device .phone"))'), true);
  await mkdir(screenshots, { recursive: true });

  for (const page of ["home", "detail", "form", "tools"]) {
    await setControls({ page });
    await capture(`${page}-light-375`);
  }
  await setControls({ page: "home" });
  await evaluate('document.querySelector("#proposed-device .phone-screen").scrollTop = 300');
  await capture("home-scrolled-glass-375");
  await setControls({ page: "detail" });
  await evaluate('document.querySelector("#proposed-device .phone-screen").scrollTop = 1000');
  await capture("detail-scrolled-glass-375");
  assert.notEqual(
    await evaluate(
      'getComputedStyle(document.querySelector("#proposed-device .detail-dock")).backdropFilter',
    ),
    "none",
    "The light glass material must blur the tab bar background.",
  );
  await setControls({ page: "home", material: "solid" });
  assert.equal(
    await evaluate(
      'getComputedStyle(document.querySelector("#proposed-device .phone-tabs")).backdropFilter',
    ),
    "none",
    "The solid mode must remove background blur.",
  );
  await capture("home-solid-375");
  await setControls({ page: "detail", material: "solid" });
  await capture("detail-solid-375");
  await setControls({ page: "home", width: 320 });
  await capture("home-light-320");
  await setControls({ page: "detail", width: 430, mode: "dark" });
  await capture("detail-dark-430");
  await setControls({ page: "form", width: 320, color: "green", mode: "light", text: "large" });
  await capture("form-green-large-320");
  await setControls({ page: "tools", width: 430, color: "orange", text: "standard" });
  await capture("tools-orange-430");

  await setControls({ page: "home" });
  await setInput("#home-search", "不存在的球局");
  assert.equal(
    await evaluate('document.querySelector("#home-results").textContent.includes("正在搜索")'),
    true,
  );
  await wait(360);
  assert.equal(
    await evaluate('document.querySelector("#home-results").textContent.includes("没有找到匹配")'),
    true,
  );
  await evaluate('document.querySelector("#proposed-device .phone-screen").scrollTop = 300');
  await capture("interaction-search-empty");
  await click('[data-action="clear-search"]');
  assert.equal(await evaluate('document.querySelector("#home-search").value'), "");

  await setControls({ page: "detail" });
  await click('#proposed-device [data-action="join"]');
  assert.equal(
    await evaluate(
      'document.querySelector("#proposed-device .detail-notice")?.textContent.includes("报名成功")',
    ),
    true,
  );
  await capture("interaction-joined");

  await setControls({ page: "form" });
  await click('#proposed-device [data-action="preview-form"]');
  assert.equal(
    await evaluate(
      'document.querySelector("#proposed-device .field-error")?.textContent.includes("名称")',
    ),
    true,
  );
  await capture("interaction-form-error");
  await setInput("#form-title", "周五晚广工进阶局");
  await click('#proposed-device [data-action="toggle-more"]');
  assert.equal(
    await evaluate('Boolean(document.querySelector("#proposed-device [name=fee]"))'),
    true,
  );
  await click('#proposed-device [data-action="preview-form"]');
  assert.equal(await evaluate('Boolean(document.querySelector(".preview-mask"))'), true);
  await capture("interaction-form-preview");
  await click('[data-action="fake-publish"]');
  assert.equal(
    await evaluate(
      'document.querySelector(".preview-toast")?.textContent.includes("未创建真实球局")',
    ),
    true,
  );
  await click("#proposed-device .phone-back");

  await setControls({ page: "tools" });
  await click('#proposed-device [data-tool="rotation"]');
  await click('#proposed-device [data-action="generate-schedule"]');
  assert.equal(
    await evaluate('document.querySelectorAll("#proposed-device .preview-match").length'),
    8,
  );
  await capture("interaction-schedule-preview");
  await click('#proposed-device [data-action="confirm-schedule"]');
  assert.equal(
    await evaluate(
      'document.querySelector("#proposed-device .design-banner")?.textContent.includes("已确认")',
    ),
    true,
  );
  await capture("interaction-schedule-confirmed");
  await click('#proposed-device [data-tool=""]');
  await click('#proposed-device [data-tool="scoring"]');
  await click('#proposed-device [data-score="0:1"]');
  assert.equal(
    await evaluate('document.querySelector("#proposed-device .score-line output")?.textContent'),
    "19",
  );
  await click('#proposed-device [data-action="undo-score"]');
  assert.equal(
    await evaluate('document.querySelector("#proposed-device .score-line output")?.textContent'),
    "18",
  );

  for (const page of ["home", "detail", "form", "tools"]) {
    for (const color of ["blue", "green", "orange"]) {
      for (const mode of ["light", "dark"]) {
        await setControls({ page, width: 320, color, mode, text: "large" });
        const overflow = await evaluate(`(() => {
          const phone = document.querySelector("#proposed-device .phone");
          return phone.scrollWidth > phone.clientWidth;
        })()`);
        assert.equal(overflow, false, `${page}/${color}/${mode}/320/large: horizontal overflow`);
      }
    }
  }
  console.log(
    "Prototype verified: four pages, glass/solid materials, 320/375/430, blue/green/orange × light/dark at 320px large text, search, join, form, schedule, score, 18 screenshots.",
  );
} finally {
  socket?.close();
  browser.kill();
  // Only remove the unique profile created by this script under the OS temp directory.
  const safeRoot = path.resolve(os.tmpdir()) + path.sep;
  const resolved = path.resolve(profile);
  if (resolved.startsWith(safeRoot) && path.basename(resolved).startsWith("yulai-ui-refresh-")) {
    try {
      await rm(resolved, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    } catch {}
  }
}
