import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Android App（APK）設定。
 *
 * ⚠️ appId 和 server.androidScheme／hostname 發布第一版後不要再改：
 * - appId 變了就是另一個 App，無法覆蓋安裝舊版
 * - App 內部網址（https://localhost）變了，IndexedDB 裡的舊資料會讀不到
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
  },
};

export default config;
