import { createPinia } from "pinia";
import { createApp } from "vue";
import App from "./App.vue";
import { initAutoBackup } from "./services/AutoBackupService";
import { proactiveMessageService } from "./services/ProactiveMessageService";
import "./styles/global.scss";
import { CodeProtection } from "./utils/codeProtection";
import { autoFixStickerUrls } from "./utils/fixStickerUrls";
import { initStorageProtection } from "./utils/storagePersistence";

// ===== 視口高度修正（iOS / Android / 瀏覽器通用）=====
// 問題：不同裝置的 screen.height、innerHeight、visualViewport.height 關係不一致
// 策略：用一個 position:fixed 的測試元素測量實際可渲染高度，這是最可靠的方法
function measureActualViewportHeight(): number {
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;top:0;bottom:0;left:0;width:1px;visibility:hidden;pointer-events:none;z-index:-1;";
  document.body.appendChild(probe);
  const h = probe.getBoundingClientRect().height;
  document.body.removeChild(probe);
  return h;
}

// 記錄「無鍵盤時」的基準高度，用於 standalone 模式偵測鍵盤彈出
let standaloneBaseHeight = 0;

function updateAppHeight(): void {
  const nav = navigator as Navigator & { standalone?: boolean };
  const isStandalone =
    ("standalone" in navigator && nav.standalone === true) ||
    window.matchMedia("(display-mode: standalone)").matches;

  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  // 收集所有可用的高度值
  const vvHeight = window.visualViewport?.height ?? 0;
  const innerH = window.innerHeight;
  const screenH = window.screen.height;
  // 用 fixed 元素測量實際可渲染高度（最可靠）
  const probeH = measureActualViewportHeight();

  let appHeight: number;
  if (isStandalone && isIOS) {
    // iOS standalone：用 probe 測量值和 screen.height 取較大值
    // probe 測量的是 position:fixed top:0 bottom:0 的實際高度，
    // 這是瀏覽器認為的可用區域，比 innerHeight 更準確
    // screen.height 在某些 iOS 版本是正確的全螢幕高度
    // 取較大值確保填滿全螢幕
    appHeight = Math.max(probeH, screenH);
    // 安全上限：不超過 innerHeight 和 screen.height 中的較大值 + 合理容差
    const safeMax = Math.max(innerH, screenH) + 10;
    if (appHeight > safeMax) {
      appHeight = safeMax;
    }
  } else if (isStandalone) {
    // Android standalone：probe 測量最準確
    appHeight = Math.max(probeH, innerH);
  } else {
    // 普通瀏覽器：用 visualViewport（會跟隨鍵盤縮放），fallback 到 probe
    appHeight = vvHeight > 0 ? vvHeight : probeH;
  }

  // Standalone (PWA) 鍵盤偵測：
  // standalone 模式下 probe/screen/innerHeight 在鍵盤彈出時不會縮小，
  // 但 visualViewport.height 會。比較兩者差距來判斷鍵盤是否打開。
  if (isStandalone && vvHeight > 0) {
    if (appHeight > standaloneBaseHeight) {
      standaloneBaseHeight = appHeight;
    }
    const diff = standaloneBaseHeight - vvHeight;
    if (diff > 100) {
      // 鍵盤已彈出 — 將 app 高度縮至可見區域
      appHeight = vvHeight;
    } else {
      // 鍵盤未彈出 — 更新基準高度
      standaloneBaseHeight = appHeight;
    }
  }

  document.documentElement.style.setProperty("--app-height", `${appHeight}px`);
  document.documentElement.style.height = `${appHeight}px`;
  document.body.style.height = `${appHeight}px`;
  const appEl = document.getElementById("app");
  if (appEl) {
    appEl.style.height = `${appHeight}px`;
  }
  // 重置 scroll 位置，防止 iOS body 偏移
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  console.log(
    `[viewport] --app-height=${appHeight}px, probe=${probeH}, vv=${vvHeight}, innerH=${innerH}, screenH=${screenH}, standalone=${isStandalone}, iOS=${isIOS}`,
  );
  requestAnimationFrame(() => {
    const el = document.getElementById("app");
    if (el) {
      const rect = el.getBoundingClientRect();
      console.log(
        `[viewport] #app 實際: top=${rect.top}, height=${rect.height}, bottom=${rect.bottom}`,
      );
    }
  });
}

// iOS 26 PWA：偵測 safe-area 是否正常，只補償頂部（瀏海），底部不補償（不要空白）
function detectAndFixSafeArea(): void {
  const nav = navigator as Navigator & { standalone?: boolean };
  const isStandalone =
    ("standalone" in navigator && nav.standalone === true) ||
    window.matchMedia("(display-mode: standalone)").matches;

  console.log(
    `[safeArea] standalone=${isStandalone}, screen.height=${window.screen.height}, dpr=${window.devicePixelRatio}`,
  );

  const testEl = document.createElement("div");
  testEl.style.cssText =
    "position:fixed;top:0;left:0;width:1px;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);visibility:hidden;pointer-events:none;";
  document.body.appendChild(testEl);

  requestAnimationFrame(() => {
    const cs = getComputedStyle(testEl);
    const safeTop = parseFloat(cs.paddingTop) || 0;
    const safeBottom = parseFloat(cs.paddingBottom) || 0;
    document.body.removeChild(testEl);

    console.log(
      `[safeArea] env() 實際值: top=${safeTop}px, bottom=${safeBottom}px`,
    );

    // 如果是 iOS standalone 且 safe-area-top 為 0，但裝置有瀏海
    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (
      isStandalone &&
      isIOS &&
      safeTop === 0 &&
      window.screen.height >= 800 &&
      window.devicePixelRatio >= 2
    ) {
      console.warn("[safeArea] 偵測到 iOS PWA safe-area bug，只補償頂部");
      // 只補償頂部（瀏海/動態島），底部設為 0（不要空白）
      document.documentElement.style.setProperty("--safe-top", "59px");
      document.documentElement.style.setProperty("--safe-area-top", "59px");
      // 底部明確設為 0 — 不要底部空白
      document.documentElement.style.setProperty("--safe-bottom", "0px");
      document.documentElement.style.setProperty("--safe-area-bottom", "0px");
    }
  });
}

updateAppHeight();
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", updateAppHeight);
  window.visualViewport.addEventListener("scroll", updateAppHeight);
} else {
  window.addEventListener("resize", updateAppHeight);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", detectAndFixSafeArea);
} else {
  detectAndFixSafeArea();
}

// ===== iOS PWA 防止 body 彈跳滾動 =====
function lockBodyScroll(): void {
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

window.addEventListener("scroll", lockBodyScroll, { passive: true });
document.addEventListener("scroll", lockBodyScroll, { passive: true });

document.addEventListener(
  "touchmove",
  (e: TouchEvent) => {
    let target = e.target as HTMLElement | null;
    while (target && target !== document.body && target !== document.documentElement) {
      const style = window.getComputedStyle(target);
      const overflowY = style.overflowY;
      const overflowX = style.overflowX;
      const isScrollableY =
        (overflowY === "auto" || overflowY === "scroll") &&
        target.scrollHeight > target.clientHeight;
      const isScrollableX =
        (overflowX === "auto" || overflowX === "scroll") &&
        target.scrollWidth > target.clientWidth;
      if (isScrollableY || isScrollableX) {
        return;
      }
      target = target.parentElement;
    }
    e.preventDefault();
  },
  { passive: false },
);

// 初始化代碼保護（僅在生產環境）
if (import.meta.env.PROD) {
  CodeProtection.initialize();
}

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.mount("#app");

// Vue 掛載後再次更新高度（確保 #app DOM 已存在）
updateAppHeight();

// 應用掛載後註冊 Service Worker 並請求持久化存儲
initStorageProtection();

// 初始化自動備份
initAutoBackup();

// 延遲啟動主動發訊息服務，確保 store 已初始化
setTimeout(() => {
  proactiveMessageService.start();
}, 3000);

// 自動修復表情包 URL（僅執行一次）
autoFixStickerUrls().catch((err) => {
  console.error("[Main] 表情包 URL 修復失敗:", err);
});
