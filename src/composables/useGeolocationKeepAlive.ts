/**
 * 地理位置保活 composable
 *
 * 利用 Geolocation API 的 watchPosition 讓瀏覽器認為頁面正在進行導航等位置相關任務，
 * 從而保持頁面在後台的活躍狀態。原理與 Google Maps 保持後台運行相同。
 *
 * 注意：
 * - 需要用戶授權位置權限
 * - 實際上不會使用任何位置資料，回調裡什麼都不做
 * - 使用 enableHighAccuracy: false 以降低功耗
 */

import { useSettingsStore } from "@/stores/settings";
import { watch } from "vue";

let watchId: number | null = null;
let isActive = false;

/**
 * 啟動地理位置保活
 */
function startGeolocationKeepAlive() {
  if (isActive || watchId !== null) return;

  if (!navigator.geolocation) {
    console.warn("[GeoKeepAlive] 此瀏覽器不支援 Geolocation API");
    return;
  }

  try {
    watchId = navigator.geolocation.watchPosition(
      // 成功回調：不做任何事，純粹保活
      () => {},
      // 錯誤回調：忽略錯誤，保活不需要真的取得位置
      () => {},
      {
        enableHighAccuracy: false,
        // 較長的超時和最大快取時間，減少實際定位請求
        timeout: 60000,
        maximumAge: Infinity,
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
