/**
 * App（APK）啟動時才載入：網頁版不會下載這個檔案。
 */
import { App } from "@capacitor/app";
import { resumeAutoBackup } from "@/services/AutoBackupService";
import { installNativeDownloadShim } from "./downloadShim";

export function initNativeApp(): void {
  installNativeDownloadShim();

  // 背景中定時器不會跑，回到前景時補上自動備份
  App.addListener("resume", () => {
    resumeAutoBackup().catch((err) => console.warn("[NativeApp] 補自動備份失敗:", err));
  });
}
