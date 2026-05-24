// 攔截 Discord OAuth 回調，避免在彈出視窗中載入整個 Vue 應用程式
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.has('auth_result') || urlParams.has('discord_error')) {
  // 將結果存入 localStorage 供主視窗讀取
  try {
    localStorage.setItem('discord_oauth_result', JSON.stringify({
      search: window.location.search,
      timestamp: Date.now()
    }));
  } catch (e) {
    console.error('Failed to save OAuth result to localStorage:', e);
  }

  // 嘗試關閉視窗
  window.close();

  // 如果無法關閉，顯示提示畫面並停止執行後續的 Vue 初始化
  document.body.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: sans-serif; text-align: center; padding: 20px; background-color: #1e1e2e; color: #cdd6f4;">
      <h2 style="color: #a6e3a1; margin-bottom: 10px;">驗證已完成</h2>
      <p style="font-size: 16px; margin-bottom: 30px; color: #bac2de;">您可以安全地關閉此視窗，並回到原來的頁面繼續操作。</p>
      <button onclick="window.close()" style="padding: 12px 24px; font-size: 16px; cursor: pointer; background-color: #89b4fa; color: #11111b; border: none; border-radius: 8px; font-weight: bold;">關閉視窗</button>
    </div>
  `;
  
  // 拋出錯誤以終止後續腳本執行
  throw new Error("OAuth callback intercepted. Stopping Vue app initialization.");
}

import PrimeVue from "primevue/config";
import Aura from "@primevue/themes/aura";

import { createPinia } from "pinia";
import { createApp } from "vue";
import App from "./App.vue";
import { registerAguaInlineCard } from "./components/common/AguaInlineCard";
import { initAutoBackup } from "./services/AutoBackupService";
import "./styles/global.scss";
import {
  beginRuntimeSession,
  consumePendingRuntimeDiagnostics,
  finalizeRuntimeSession,
  getRuntimeDiagnostics,
  heartbeatRuntimeSession,
  recordReloadReason,
  recordRuntimeDiagnostic,
  recordRuntimeError,
  resumeRuntimeSession,
  updateRuntimeSessionStage,
} from "./utils/runtimeDiagnostics";
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
      console.warn("[safeArea] 偵測到 iOS PWA safe-area bug，補頂部 + 推算底部 home indicator");
      // 補償頂部（瀏海/動態島）
      document.documentElement.style.setProperty("--safe-top", "59px");
      document.documentElement.style.setProperty("--safe-area-top", "59px");

      // 推算底部 home indicator 高度：app-height 與 visualViewport 之差
      // 不能直接設 0，否則無 Home 鍵的機型（iPhone X 之後）會把 input-area 推進手勢區看不到
      const probeAppHeight =
        parseFloat(
          document.documentElement.style.getPropertyValue("--app-height"),
        ) || window.innerHeight;
      const vvH = window.visualViewport?.height ?? probeAppHeight;
      const inferredBottom = Math.max(0, Math.round(probeAppHeight - vvH));
      // 合理範圍：iPhone 系列 home indicator 約 20~50px
      const safeBottomPx =
        inferredBottom >= 10 && inferredBottom <= 60 ? inferredBottom : 34;
      document.documentElement.style.setProperty("--safe-bottom", `${safeBottomPx}px`);
      document.documentElement.style.setProperty(
        "--safe-area-bottom",
        `${safeBottomPx}px`,
      );
      console.log(
        `[safeArea] 推算 home indicator: ${inferredBottom}px (app=${probeAppHeight}, vv=${vvH}) → 套用 ${safeBottomPx}px`,
      );
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

// ===== 全域鍵盤感知：輸入框自動滾入可見區域 =====
{
  let activeInput: HTMLElement | null = null;

  document.addEventListener("focusin", (e) => {
    const t = e.target as HTMLElement;
    if (
      t.tagName === "INPUT" ||
      t.tagName === "TEXTAREA" ||
      t.contentEditable === "true"
    ) {
      activeInput = t;
    }
  });
  document.addEventListener("focusout", () => {
    activeInput = null;
  });

  if (window.visualViewport) {
    let prevVVH = window.visualViewport.height;
    window.visualViewport.addEventListener("resize", () => {
      const curVVH = window.visualViewport!.height;
      const keyboardOpened = curVVH < prevVVH - 80;
      prevVVH = curVVH;
      if (keyboardOpened && activeInput && document.activeElement === activeInput) {
        setTimeout(() => {
          if (activeInput && document.activeElement === activeInput) {
            const rect = activeInput.getBoundingClientRect();
            if (rect.bottom > curVVH || rect.top < 0) {
              activeInput.scrollIntoView({ block: "center", behavior: "smooth" });
            }
          }
        }, 120);
      }
    });
  }
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
    while (
      target &&
      target !== document.body &&
      target !== document.documentElement
    ) {
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

function showPendingRuntimeDiagnostics(): void {
  const pendingEntries = consumePendingRuntimeDiagnostics();
  if (pendingEntries.length === 0) {
    return;
  }

  const message = pendingEntries
    .map((entry) => {
      const time = new Date(entry.timestamp).toLocaleString();
      let text = `[${entry.kind}] ${entry.source} @ ${time}\n${entry.message}`;
      if (entry.details && typeof entry.details === "object") {
        const data = entry.details as Record<string, unknown>;
        const stageDetails = data.lastStageDetails;
        if (stageDetails && typeof stageDetails === "object" && Object.keys(stageDetails as object).length > 0) {
          text += `\nstage data:\n${JSON.stringify(stageDetails, null, 2)}`;
        }
      }
      return text;
    })
    .join("\n\n");

  console.error("[RuntimeDiagnostics] 偵測到上次執行留下的錯誤/重載紀錄:\n" + message);
  const banner = document.createElement("div");
  banner.setAttribute("data-runtime-diagnostics-banner", "true");
  banner.style.position = "fixed";
  banner.style.top = "0";
  banner.style.left = "0";
  banner.style.right = "0";
  banner.style.zIndex = "999999";
  banner.style.background = "rgba(120, 0, 0, 0.95)";
  banner.style.color = "#fff";
  banner.style.padding = "12px 16px";
  banner.style.fontSize = "12px";
  banner.style.lineHeight = "1.5";
  banner.style.whiteSpace = "pre-wrap";
  banner.style.wordBreak = "break-all";
  banner.style.overflowWrap = "break-word";
  banner.style.boxShadow = "0 4px 12px rgba(0,0,0,0.35)";
  banner.style.maxHeight = "60vh";
  banner.style.overflowY = "auto";
  banner.textContent = `上次疑似異常中斷或重整：\n\n${message}`;
  banner.addEventListener("click", () => {
    banner.remove();
  });
  document.body.appendChild(banner);
}

function installGlobalRuntimeDiagnostics(): void {
  window.addEventListener("error", (event) => {
    recordRuntimeError("window.error", event.error ?? event.message, {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    // AbortError 是瀏覽器在頁面背景化、freeze、或取消 fetch/IDB transaction 時的預期行為
    // 不應視為崩潰，只需記錄為 diagnostic event
    if (reason instanceof Error && reason.name === "AbortError") {
      event.preventDefault();
      recordRuntimeDiagnostic("event", "window.unhandledrejection.aborted", "Expected AbortError (page hidden or browser-cancelled operation)", {
        message: reason.message,
        visibilityState: document.visibilityState,
        stack: reason.stack,
      });
      return;
    }
    recordRuntimeError("window.unhandledrejection", reason, {
      type: typeof reason,
      visibilityState: document.visibilityState,
    });
  });

  window.addEventListener("beforeunload", () => {
    finalizeRuntimeSession("beforeunload");
    recordRuntimeDiagnostic("event", "window.beforeunload", "Page is unloading");
  });

  // 依 Page Lifecycle API：頁面進入 hidden 後，系統/瀏覽器隨時可能凍結或回收此頁，
  // 且多數行動裝置不會再觸發 pagehide/beforeunload。因此把「hidden」視為優雅檢查點，
  // 避免把正常的背景回收誤判成「上次 session 異常中斷」。
  // 回到 visible 時再把 session 標回「進行中」，真正崩潰時仍能捕捉。
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      finalizeRuntimeSession("visibility:hidden");
    } else {
      resumeRuntimeSession("visibility:visible");
    }
  });

  window.addEventListener("pagehide", () => {
    finalizeRuntimeSession("pagehide");
  });

  const debugTarget = window as Window & {
    __AGUAPHONE_DEBUG__?: {
      getRuntimeDiagnostics: typeof getRuntimeDiagnostics;
      recordRuntimeDiagnostic: typeof recordRuntimeDiagnostic;
      recordRuntimeError: typeof recordRuntimeError;
      recordReloadReason: typeof recordReloadReason;
    };
  };

  debugTarget.__AGUAPHONE_DEBUG__ = {
    getRuntimeDiagnostics,
    recordRuntimeDiagnostic,
    recordRuntimeError,
    recordReloadReason,
  };
}

beginRuntimeSession("main.ts bootstrap", {
  userAgent: navigator.userAgent,
  href: window.location.href,
});
installGlobalRuntimeDiagnostics();
showPendingRuntimeDiagnostics();

window.setInterval(() => {
  heartbeatRuntimeSession();
}, 10000);

// 註冊自訂元素（必須在 createApp 前，確保 Vue 編譯器設定到位前 customElements 已知）
registerAguaInlineCard();

const app = createApp(App);
const pinia = createPinia();
updateRuntimeSessionStage("vue app created");

// 註：<aguaphone-*> 自訂元素的識別已透過 vite.config.ts 的 @vitejs/plugin-vue
// template.compilerOptions.isCustomElement 在編譯期完成；runtime-only build 不支援 app.config.compilerOptions。

app.config.errorHandler = (error, instance, info) => {
  recordRuntimeError("vue.errorHandler", error, {
    info,
    component: instance?.$options?.name ?? instance?.$options?.__name ?? "anonymous",
  });
  console.error("[VueError]", error, info);
};

app.use(PrimeVue, {
  theme: {
    preset: Aura,
    options: {
      // 僅在 <html class="app-dark"> 時啟用 PrimeVue 暗色，避免跟系統 prefers-color-scheme 綁定
      darkModeSelector: ".app-dark",
    },
  },
});
updateRuntimeSessionStage("primevue configured");
app.use(pinia);
updateRuntimeSessionStage("pinia configured");
app.mount("#app");
updateRuntimeSessionStage("app mounted");

// Discord OAuth2 回傳參數處理（使用者從 Discord 授權頁面 redirect 回來時）
(async () => {
  try {
    updateRuntimeSessionStage("discord callback handling");
    const { useCloudPushStore } = await import("./stores/cloudPush");
    const cloudPushStore = useCloudPushStore();
    await cloudPushStore.loadSettings();
    await cloudPushStore.handleDiscordOAuthCallback();
    updateRuntimeSessionStage("discord callback handled");
  } catch {
    // 非關鍵路徑
  }
})();

// Vue 掛載後再次更新高度（確保 #app DOM 已存在）
updateAppHeight();

// 應用掛載後註冊 Service Worker 並請求持久化存儲
updateRuntimeSessionStage("storage protection init start");
initStorageProtection();
updateRuntimeSessionStage("storage protection init dispatched");

// 初始化自動備份
initAutoBackup();
updateRuntimeSessionStage("auto backup initialized");

// 主動發訊息服務由 App.vue 在 characters 載入後啟動，此處不再無條件啟動

// 自動修復表情包 URL（僅執行一次）
autoFixStickerUrls().catch((err) => {
  console.error("[Main] 表情包 URL 修復失敗:", err);
});
