// 把貼圖排版頁截成透明底的總表 sheet.png（6 欄 × N 列，每格 240×240）
//
// 用法（在這個資料夾裡）：
//   1. 下載字體放在這裡，檔名 huninn.ttf（jf open 粉圓，OFL 授權）：
//      https://github.com/justfont/open-huninn-font/releases/download/v2.1/jf-openhuninn-2.1.ttf
//   2. 開無頭 Chrome：
//      "C:/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --remote-debugging-port=9334 --user-data-dir=<暫存資料夾> --allow-file-access-from-files about:blank
//   3. node render-stickers.mjs greenbubble-stickers.html
//   4. python slice-stickers.py sheet.png ../../public/chat-skins/greenbubble
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const page = resolve(here, process.argv[2] || "greenbubble-stickers.html");

const list = await (await fetch("http://127.0.0.1:9334/json")).json();
const target = list.find((t) => t.type === "page");
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let id = 0;
const pending = new Map();
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
});
const send = (method, params = {}) => {
  const i = ++id;
  ws.send(JSON.stringify({ id: i, method, params }));
  return new Promise((r) => pending.set(i, r));
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 2400, deviceScaleFactor: 1, mobile: false });
// 透明背景：截出來的 PNG 才會是透明底
await send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
await send("Page.navigate", { url: pathToFileURL(page).href });
for (let i = 0; i < 40; i++) {
  await sleep(250);
  const r = await send("Runtime.evaluate", { expression: "document.body && document.body.dataset.ready", returnByValue: true });
  if (r.result?.result?.value === "1") break;
}
await sleep(500);
const n = (await send("Runtime.evaluate", { expression: "document.querySelectorAll('.s').length", returnByValue: true })).result.result.value;
const rows = Math.ceil(n / 6);
const res = await send("Page.captureScreenshot", {
  format: "png",
  clip: { x: 0, y: 0, width: 1440, height: rows * 240, scale: 1 },
});
const out = resolve(here, "sheet.png");
writeFileSync(out, Buffer.from(res.result.data, "base64"));
console.log(`${n} 張 → ${out}`);
ws.close();
