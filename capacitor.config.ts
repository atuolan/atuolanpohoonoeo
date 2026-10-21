import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Android（APK）與 iOS（IPA）App 設定。
 *
 * ⚠️ appId 和 server.androidScheme／hostname 發布第一版後不要再改：
 * - appId 變了就是另一個 App，無法覆蓋安裝舊版
 * - App 內部網址（Android https://localhost、iOS capacitor://localhost）變了，IndexedDB 裡的舊資料會讀不到
 *   iOS 不能用 https 當自訂網址，所以兩邊不一樣；iosScheme 維持預設，不要設
 */
const config: CapacitorConfig = {
  appId: "uk.aguacloud.aguaphone",
  appName: "203 Phone",
  // npm run build 的輸出，整包複製進 APK
  webDir: "dist",
  server: {
    androidScheme: "https",
    hostname: "localhost",
  },
  android: {
    // 頁面是 https://localhost，使用者設定的 http:// API 和圖片才不會被擋
    allowMixedContent: true,
  },
  plugins: {
    SystemBars: {
      // 把正確的狀態列／導覽列高度寫進 CSS 的 --safe-area-inset-*（舊版 WebView 的 env() 會是 0）
      insetsHandling: "css",
      // index.html 本來就是 viewport-fit=cover，一開始就照滿版排，免得載入時先縮後撐
      initialViewportFitValueHint: "cover",
    },
    // 系統通知（src/native/notifications.ts）：Android 狀態列小圖示，要白色剪影，在 res/drawable
    LocalNotifications: {
      smallIcon: "ic_stat_notify",
    },
    // 熱更新（src/native/liveUpdate.ts）：自己判斷何時下載、套用，不連 Capgo 的伺服器
    CapacitorUpdater: {
      autoUpdate: false,
      // 空字串＝不回報使用統計、不查 Capgo 的頻道與更新
      statsUrl: "",
      channelUrl: "",
      updateUrl: "",
      // 新版網頁 20 秒內沒呼叫 notifyAppReady 就退回上一版（舊手機開 App 比較慢，留寬一點）
      appReadyTimeout: 20000,
      // 裝了新 APK 就改用 APK 裡的網頁，清掉之前下載的
      resetWhenUpdate: true,
      autoDeleteFailed: true,
      autoDeletePrevious: true,
    },
  },
};

export default config;
