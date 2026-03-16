/**
 * 持久化存儲與 Service Worker 註冊
 *
 * 手機瀏覽器（特別是 Edge）會在存儲壓力下自動清除「臨時存儲」的網站數據。
 * 透過 navigator.storage.persist() 請求持久化存儲，可以防止瀏覽器自動驅逐 IndexedDB 和 Cache 數據。
 *
 * Chromium 的 persist() 授權基於啟發式評分，註冊 Service Worker + Web App Manifest
 * 是提高評分的關鍵因素。
 *
 * 注意：persist() 被拒絕通常不是程式錯誤，而是瀏覽器策略決策。
 * 我們能做的是提高授權成功率，並在拒絕時增加後續重試機會。
 */

let persistRetryHooksBound = false;
let lastPersistAttemptAt = 0;
const PERSIST_RETRY_COOLDOWN_MS = 60 * 1000; // 1 分鐘內避免過度重試

/**
 * 註冊 Service Worker
 * 這是獲得持久化存儲權限的重要前提條件
 */
export async function registerServiceWorker(): Promise<boolean> {
  if (!("serviceWorker" in navigator)) {
    console.warn("[SW] 此瀏覽器不支援 Service Worker");
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.register("/sw.js");
    console.log("[SW] Service Worker 註冊成功:", registration.scope);

    // 偵測新 SW 進入 waiting 狀態（有更新可用）
    const onUpdateFound = () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener("statechange", () => {
        // 新 SW 安裝完成且有舊 SW 在運行 → 通知頁面有更新
        if (
          newWorker.state === "installed" &&
          navigator.serviceWorker.controller
        ) {
          console.log("[SW] 新版本已就緒，通知頁面");
          window.dispatchEvent(new CustomEvent("sw:update-available"));
        }
      });
    };

    registration.addEventListener("updatefound", onUpdateFound);

    // 頁面重新整理後，若新 SW 已在 waiting，也要通知
    if (registration.waiting && navigator.serviceWorker.controller) {
      window.dispatchEvent(new CustomEvent("sw:update-available"));
    }

    return true;
  } catch (error) {
    console.error("[SW] Service Worker 註冊失敗:", error);
    return false;
  }
}

/**
 * 觸發 SW 更新：通知 waiting 中的新 SW 可以 skipWaiting
 * 呼叫後頁面會自動 reload
 */
export async function applyServiceWorkerUpdate(): Promise<void> {
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration?.waiting) return;

  // 監聽 controllerchange：新 SW 接管後 reload
  navigator.serviceWorker.addEventListener(
    "controllerchange",
    () => {
      window.location.reload();
    },
    { once: true },
  );

  // 通知 waiting 中的新 SW 執行 skipWaiting
  registration.waiting.postMessage({ type: "SKIP_WAITING" });
}

/**
 * 請求持久化存儲權限
 * 成功後瀏覽器不會在存儲壓力下自動清除本站數據
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) {
    console.warn("[Storage] 此瀏覽器不支援 Persistent Storage API");
    return false;
  }

  const now = Date.now();
  if (now - lastPersistAttemptAt < PERSIST_RETRY_COOLDOWN_MS) {
    return false;
  }
  lastPersistAttemptAt = now;

  try {
    const alreadyPersisted = await navigator.storage.persisted();
    if (alreadyPersisted) {
      console.log("[Storage] 已獲得持久化存儲權限");
      return true;
    }

    const granted = await navigator.storage.persist();
    if (granted) {
      console.log("[Storage] 成功獲得持久化存儲權限");
      return true;
    }

    console.warn(
      "[Storage] 持久化存儲請求被拒絕（瀏覽器策略）。已啟用後續自動重試機制。",
    );
    bindPersistRetryHooks();
    return false;
  } catch (error) {
    console.error("[Storage] 請求持久化存儲失敗:", error);
    bindPersistRetryHooks();
    return false;
  }
}

/**
 * 初始化存儲保護：先註冊 SW，再請求持久化，最後請求通知權限
 */
export async function initStorageProtection(): Promise<void> {
  // 先註冊 Service Worker（提高 persist 評分）
  await registerServiceWorker();

  // 再請求持久化存儲
  const granted = await requestPersistentStorage();

  if (!granted) {
    // 記錄存儲使用情況供除錯
    await logStorageEstimate();

    // 首次拒絕後，等待使用者互動/回到前景再嘗試
    bindPersistRetryHooks();
  }

  // 請求系統通知權限（使用者首次會看到瀏覽器授權提示）
  await requestNotificationPermission();
}

/**
 * 請求系統通知權限
 */
async function requestNotificationPermission(): Promise<void> {
  if (!("Notification" in window)) {
    console.warn("[Notification] 此瀏覽器不支援系統通知");
    return;
  }

  if (Notification.permission === "granted") {
    console.log("[Notification] 已獲得系統通知權限");
    return;
  }

  if (Notification.permission === "denied") {
    console.warn("[Notification] 系統通知權限已被拒絕");
    return;
  }

  try {
    const result = await Notification.requestPermission();
    console.log("[Notification] 系統通知權限:", result);
  } catch (error) {
    console.error("[Notification] 請求通知權限失敗:", error);
  }
}

function bindPersistRetryHooks(): void {
  if (persistRetryHooksBound) return;
  persistRetryHooksBound = true;

  const retry = async () => {
    const ok = await requestPersistentStorage();
    if (ok) {
      unbind();
    }
  };

  const onVisible = () => {
    if (document.visibilityState === "visible") {
      void retry();
    }
  };

  const onInteraction = () => {
    void retry();
  };

  const unbind = () => {
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", onVisible);
    window.removeEventListener("pointerdown", onInteraction);
    window.removeEventListener("keydown", onInteraction);
    persistRetryHooksBound = false;
  };

  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", onVisible);
  window.addEventListener("pointerdown", onInteraction, { passive: true });
  window.addEventListener("keydown", onInteraction);
}

async function logStorageEstimate(): Promise<void> {
  if (!navigator.storage?.estimate) return;

  try {
    const estimate = await navigator.storage.estimate();
    const usage = estimate.usage ?? 0;
    const quota = estimate.quota ?? 0;
    const pct = quota > 0 ? Math.round((usage / quota) * 100) : 0;
    console.log(`[Storage] 使用量: ${fmt(usage)} / ${fmt(quota)} (${pct}%)`);
  } catch {
    // ignore
  }
}

function fmt(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}
