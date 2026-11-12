/**
 * 量小屋耗不耗電、卡不卡（開發用）。
 *
 *   npm run dev -- --port 5199          # 另一個終端機
 *   node scripts/pixel-house/harness/measure.mjs [--cat]     # --cat：養一隻貓再量
 *
 * 用無頭瀏覽器開測試頁（不經過登入），CPU 放慢 4 倍模擬手機，量三段：
 *   放著不動（他站著）、他在走路、左右滑房間
 * 每段印出：程式執行時間、樣式重算次數、版面重排次數、超過 50 毫秒的卡頓次數、計時器醒來幾次。
 * 每做完一期跑一次，跟上一次的數字比（記在 docs/superpowers/specs 的計畫裡）。
 * 量不到真機的耗電，那個要在手機上看。
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const url = process.env.HOUSE_URL || "http://localhost:5199/scripts/pixel-house/harness/index.html";
const seconds = 20;

const browser = await chromium.launch();
// 固定在下午：他會到處走動（晚上都在睡覺，量不到走路）
const hour = new Date().getUTCHours();
let off = (14 - hour + 24) % 24;
if (off > 12) off -= 24;
const timezoneId = off === 0 ? "UTC" : `Etc/GMT${off > 0 ? "-" : "+"}${Math.abs(off)}`;
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, timezoneId });
const page = await ctx.newPage();

// 數計時器醒來幾次、卡頓幾次
await page.addInitScript(() => {
  const w = window;
  w.__wake = 0;
  w.__long = 0;
  const wrap = (name) => {
    const orig = w[name];
    w[name] = (fn, ...rest) => orig(typeof fn === "function" ? (...a) => { w.__wake++; return fn(...a); } : fn, ...rest);
  };
  wrap("setTimeout");
  wrap("setInterval");
  wrap("requestAnimationFrame");
  try {
    new PerformanceObserver((l) => (w.__long += l.getEntries().length)).observe({ entryTypes: ["longtask"] });
  } catch {}
});

await page.goto(url);
await page.waitForTimeout(2500);
await page.evaluate(
  (withCat) =>
    new Promise((res) => {
      localStorage.setItem("pixel_house_state", JSON.stringify({ homeStyle: "pixel-house", guideSeen: true, residentCharId: "measure-1" }));
      // --cat：養一隻貓再量（畫面上多一個會走的）
      if (withCat) {
        const stat = { v: 90, at: Date.now() };
        localStorage.setItem("pixel_house_life", JSON.stringify({ cat: { name: "測試貓", color: "orange", food: stat, clean: stat, mood: stat } }));
      } else localStorage.removeItem("pixel_house_life");
      const r = indexedDB.open("aguaphone-db");
      r.onsuccess = () => {
        const db = r.result;
        const tx = db.transaction("characters", "readwrite");
        tx.objectStore("characters").put({ id: "measure-1", nickname: "測試", avatar: "", data: { name: "測試", description: "", first_mes: "" }, createdAt: Date.now(), updatedAt: Date.now() });
        tx.oncomplete = () => { db.close(); res(1); };
      };
      r.onerror = () => res(0);
    }),
  process.argv.includes("--cat"),
);
const t0 = Date.now();
await page.reload();
await page.waitForSelector(".ph-me", { state: "attached", timeout: 20000 });
const openMs = Date.now() - t0;
const images = await page.evaluate(() => performance.getEntriesByType("resource").filter((e) => /\.(png|webp|jpg)/.test(e.name)).length);

const cdp = await ctx.newCDPSession(page);
await cdp.send("Performance.enable");
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

async function snap() {
  const { metrics } = await cdp.send("Performance.getMetrics");
  const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
  const c = await page.evaluate(() => ({ wake: window.__wake, long: window.__long }));
  return { script: m.ScriptDuration, style: m.RecalcStyleCount, layout: m.LayoutCount, task: m.TaskDuration, ...c };
}
async function span(label, ms, during) {
  const a = await snap();
  const start = Date.now();
  if (during) await during(ms);
  const rest = ms - (Date.now() - start);
  if (rest > 0) await page.waitForTimeout(rest);
  const b = await snap();
  const sec = (Date.now() - start) / 1000;
  const row = {
    情境: label,
    秒: sec.toFixed(1),
    "程式(ms/秒)": (((b.script - a.script) * 1000) / sec).toFixed(2),
    "全部工作(ms/秒)": (((b.task - a.task) * 1000) / sec).toFixed(2),
    "樣式重算/秒": ((b.style - a.style) / sec).toFixed(1),
    "重排/秒": ((b.layout - a.layout) / sec).toFixed(1),
    "計時器醒來/秒": ((b.wake - a.wake) / sec).toFixed(1),
    卡頓: b.long - a.long,
  };
  rows.push(row);
}
const rows = [];
const walking = () => page.evaluate(() => /走/.test(document.querySelector(".ph-hint")?.textContent || ""));

// 1. 放著不動：等他站定再量
for (let i = 0; i < 80 && (await walking()); i++) await page.waitForTimeout(250);
await span("放著不動（他站著）", Math.min(seconds, 15) * 1000);

// 2. 他在走路：等到他開始走，量到他走到
for (let i = 0; i < 240 && !(await walking()); i++) await page.waitForTimeout(250);
await span("他在走路", 0, async () => {
  for (let i = 0; i < 200 && (await walking()); i++) await page.waitForTimeout(100);
});

// 3. 左右滑房間
await span("左右滑房間", 0, async () => {
  for (let n = 0; n < 6; n++) {
    const dir = n % 2 ? 1 : -1;
    const x0 = dir < 0 ? 320 : 70;
    await page.mouse.move(x0, 420);
    await page.mouse.down();
    for (let k = 1; k <= 12; k++) await page.mouse.move(x0 + dir * k * 20, 420, { steps: 1 }), await page.waitForTimeout(16);
    await page.mouse.up();
    await page.waitForTimeout(450);
  }
});

console.log(`打開小屋：${openMs} ms，載了 ${images} 張圖（CPU 放慢 4 倍前）`);
console.table(rows);
await browser.close();
