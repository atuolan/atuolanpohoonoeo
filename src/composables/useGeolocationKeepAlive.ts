/**
 * 地理位置保活 composable
 *
 * 利用 Geolocation API 的 watchPosition 讓瀏覽器認為頁面正在進行導航等位置相關任務，
 * 從而保持頁面在後台的活躍狀態。原理與 Google Maps 保持後台運行相同。
 *
 * 多層保活策略（與音訊保活類似）：
 * 1. watchPosition（enableHighAccuracy: true）— 核心保活
 * 2. Web Lock — 讓瀏覽器不輕易回收頁面
 * 3. Web Worker 心跳 — 每 15 秒 ping 主線程，防止 JS 被凍結
 * 4. visibilitychange / freeze / resume — 頁面恢復時重建保活
 *
 * 注意：
 * - 需要用戶授權位置權限
 * - 實際上不會使用任何位置資料，回調裡只做日誌
 * - 使用 enableHighAccuracy: true 以確保系統持續追蹤定位（保活關鍵）
 */

import { useSettingsStore } from "@/stores/settings";
import { watch } from "vue";

let watchId: number | null = null;
let isActive = false;
let lockController: AbortController | null = null;
let heartbeatWorker: Worker | null = null;
let workerBlobUrl: string | null = null;
let lastGeoCallbackAt = 0;

// ─── Web Lock ──────────────────────────────────────────────────

function acquireWebLock() {
  if (lockController) return;

  if (!("locks" in navigator)) {
    console.warn("[GeoKeepAlive] Web Lock API 不支援");
    return;
  }

  lockController = new AbortController();
  navigator.locks
    .request(
      "geo-keep-alive-lock",
      { signal: lockController.signal },
      () =>
        new Promise<void>(() => {
          console.log("[GeoKeepAlive] Web Lock 已取得");
        }),
    )
    .catch((e) => {
      if (e.name !== "AbortError") {
        console.warn("[GeoKeepAlive] Web Lock 取得失敗:", e);
      }
    });
}

function releaseWebLock() {
  if (lockController) {
    lockController.abort();
    lockController = null;
  }
}

// ─── Web Worker 心跳 ───────────────────────────────────────────

function startHeartbeatWorker() {
  if (heartbeatWorker) return;

  try {
    const workerCode = `
      let interval = null;
      self.onmessage = (e) => {
        if (e.data === 'start') {
          interval = setInterval(() => {
            self.postMessage('heartbeat');
            // 發一個 HEAD 請求保持網路活動（防止 iOS 認為頁面閒置）
            fetch(self.location?.origin || '/', { method: 'HEAD', mode: 'no-cors' }).catch(() => {});
          }, 15000);
        } else if (e.data === 'stop') {
          if (interval) clearInterval(interval);
          interval = null;
        }
      };
    `;
    const blob = new Blob([workerCode], { type: "application/javascript" });
    workerBlobUrl = URL.createObjectURL(blob);
    heartbeatWorker = new Worker(workerBlobUrl);

    heartbeatWorker.onmessage = () => {
      // 心跳回調：檢查 watchPosition 是否還活著
      const now = Date.now();
      if (lastGeoCallbackAt > 0 && now - lastGeoCallbackAt > 120_000) {
        // 超過 2 分鐘沒收到定位回調，嘗試重啟 watchPosition
        console.warn("[GeoKeepAlive] 定位回調超時，嘗試重啟 watchPosition");
        stopWatchPosition();
        startWatchPosition();
      }
    };

    heartbeatWorker.postMessage("start");
    console.log("[GeoKeepAlive] 心跳 Worker 已啟動");
  } catch (e) {
    console.warn("[GeoKeepAlive] 心跳 Worker 啟動失敗:", e);
  }
}

function stopHeartbeatWorker() {
  if (heartbeatWorker) {
    heartbeatWorker.postMessage("stop");
    heartbeatWorker.terminate();
    heartbeatWorker = null;
  }
  if (workerBlobUrl) {
    URL.revokeObjectURL(workerBlobUrl);
    workerBlobUrl = null;
  }
}

// ─── Geolocation watchPosition ─────────────────────────────────

async function startWatchPosition() {
  if (watchId !== null) return;

  if (!navigator.geolocation) {
    console.warn("[GeoKeepAlive] 此瀏覽器不支援 Geolocation API");
    return;
  }

  // 先檢查權限狀態
  if (navigator.permissions) {
    try {
      const status = await navigator.permissions.query({ name: "geolocation" });
      console.log("[GeoKeepAlive] 當前權限狀態:", status.state);

      if (status.state === "denied") {
        console.warn("[GeoKeepAlive] 位置權限已被拒絕，無法啟用保活");
        return;
      }
    } catch {
      // Permissions API 不支援 geolocation 查詢，繼續嘗試
    }
  }

  try {
    watchId = navigator.geolocation.watchPosition(
      () => {
        lastGeoCallbackAt = Date.now();
        console.log("[GeoKeepAlive] 定位回調觸發，保活運作中");
      },
      (error) => {
        // 定位錯誤不影響保活，watchPosition 本身仍在運行
        lastGeoCallbackAt = Date.now();
        console.warn("[GeoKeepAlive] 定位錯誤（不影響保活）:", error.code, error.message);
      },
      {
        enableHighAccuracy: true,
        timeout: Infinity,
        maximumAge: 0,
      },
    );
    console.log("[GeoKeepAlive] watchPosition 已啟動，watchId:", watchId);
  } catch (e) {
    console.error("[GeoKeepAlive] watchPosition 啟動失敗:", e);
  }
}

function stopWatchPosition() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
}

// ─── 頁面生命週期 ──────────────────────────────────────────────

function handleVisibilityChange() {
  if (!isActive) return;

  if (document.visibilityState === "visible") {
    // 切回前台：檢查 watchPosition 是否還活著，不活就重啟
    console.log("[GeoKeepAlive] 頁面恢復可見，檢查保活狀態");
    if (watchId === null) {
      console.log("[GeoKeepAlive] watchPosition 已失效，重新啟動");
      startWatchPosition();
    }
  }
}

function handleFreeze() {
  console.log("[GeoKeepAlive] 頁面被凍結");
}

function handleResume() {
  if (!isActive) return;
  console.log("[GeoKeepAlive] 頁面從凍結恢復，重建保活");
  // 凍結恢復後 watchPosition 可能已失效，重啟
  stopWatchPosition();
  startWatchPosition();
}

// ─── 啟停控制 ──────────────────────────────────────────────────

async function startGeolocationKeepAlive() {
  if (isActive) return;
  isActive = true;
  lastGeoCallbackAt = 0;

  // 1. Web Lock
  acquireWebLock();

  // 2. 心跳 Worker
  startHeartbeatWorker();

  // 3. watchPosition
  await startWatchPosition();

  // 4. 頁面生命週期監聽
  document.addEventListener("visibilitychange", handleVisibilityChange);
  document.addEventListener("freeze", handleFreeze);
  document.addEventListener("resume", handleResume);

  console.log("[GeoKeepAlive] 地理位置保活已啟用（多層策略）");
}

function stopGeolocationKeepAlive() {
  if (!isActive) return;
  isActive = false;

  releaseWebLock();
  stopHeartbeatWorker();
  stopWatchPosition();
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  document.removeEventListener("freeze", handleFreeze);
  document.removeEventListener("resume", handleResume);

  console.log("[GeoKeepAlive] 地理位置保活已停用");
}

/**
 * 地理位置保活 composable
 * 監聽設定開關，自動啟停
 */
export function useGeolocationKeepAlive() {
  watch(
    () => useSettingsStore().geolocationKeepAliveEnabled,
    (enabled) => {
      if (enabled) {
        startGeolocationKeepAlive();
      } else {
        stopGeolocationKeepAlive();
      }
    },
    { immediate: true },
  );

  return {
    start: startGeolocationKeepAlive,
    stop: stopGeolocationKeepAlive,
  };
}
