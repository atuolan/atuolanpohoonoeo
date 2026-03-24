/**
 * 地理位置保活 composable
 *
 * 利用 Geolocation API 的 watchPosition 讓瀏覽器認為頁面正在進行導航等位置相關任務，
 * 從而保持頁面在後台的活躍狀態。原理與 Google Maps 保持後台運行相同。
 *
 * 注意：
 * - 需要用戶授權位置權限
 * - 實際上不會使用任何位置資料，回調裡什麼都不做
 * - 使用 enableHighAccuracy: true 以確保系統持續追蹤定位（保活關鍵）
 */

import { useSettingsStore } from "@/stores/settings";
import { watch } from "vue";

let watchId: number | null = null;
let isActive = false;

/**
 * 啟動地理位置保活
 * 先檢查/請求權限，再啟動 watchPosition
 */
async function startGeolocationKeepAlive() {
  if (isActive || watchId !== null) return;

  if (!navigator.geolocation) {
    console.warn("[GeoKeepAlive] 此瀏覽器不支援 Geolocation API");
    return;
  }

  // 先檢查權限狀態（如果 Permissions API 可用）
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
      // 成功回調：記錄一次確認保活正常運作
      () => {
        console.log("[GeoKeepAlive] 定位回調觸發，保活運作中");
      },
      // 錯誤回調：記錄錯誤但不停止（即使定位失敗，watchPosition 本身仍能保活）
      (error) => {
        console.warn("[GeoKeepAlive] 定位錯誤（不影響保活）:", error.code, error.message);
      },
      {
        // 使用高精度以確保系統持續追蹤 GPS，這是保活的關鍵
        enableHighAccuracy: true,
        timeout: Infinity,
        maximumAge: 0,
      },
    );
    isActive = true;
    console.log("[GeoKeepAlive] 地理位置保活已啟用，watchId:", watchId);
  } catch (e) {
    console.error("[GeoKeepAlive] 啟動失敗:", e);
  }
}

/**
 * 停止地理位置保活
 */
function stopGeolocationKeepAlive() {
  if (!isActive || watchId === null) return;

  navigator.geolocation.clearWatch(watchId);
  watchId = null;
  isActive = false;
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
