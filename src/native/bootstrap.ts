/**
 * App（APK）啟動時才載入：網頁版不會下載這個檔案。
 */
import { App } from "@capacitor/app";
import { resumeAutoBackup } from "@/services/AutoBackupService";
import { installNativeDownloadShim } from "./downloadShim";
import { handleOAuthReturnUrl } from "./oauth";

function handleIncomingUrl(url: string): void {
  handleOAuthReturnUrl(url).catch((err) => console.error("[NativeApp] 處理授權回傳失敗:", err));
}

export function initNativeApp(): void {
  installNativeDownloadShim();

  // 背景中定時器不會跑，回到前景時補上自動備份
  App.addListener("resume", () => {
    resumeAutoBackup().catch((err) => console.warn("[NativeApp] 補自動備份失敗:", err));
  });

  // Discord 授權完導回 App 的專屬連結
  App.addListener("appUrlOpen", ({ url }) => handleIncomingUrl(url));
  // App 在瀏覽器授權期間被系統關掉時，是被那個連結重新開起來的
  App.getLaunchUrl()
    .then((launch) => {
      if (launch?.url) handleIncomingUrl(launch.url);
    })
    .catch(() => {});
}
