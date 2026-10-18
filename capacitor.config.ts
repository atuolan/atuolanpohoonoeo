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
};

export default config;
