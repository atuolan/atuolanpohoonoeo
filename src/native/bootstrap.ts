/**
 * App（APK）啟動時才載入：網頁版不會下載這個檔案。
 */
import { App } from "@capacitor/app";
import { resumeAutoBackup } from "@/services/AutoBackupService";
import { pushNotificationService } from "@/services/PushNotificationService";
import { installNativeDownloadShim } from "./downloadShim";
import { initLiveUpdate } from "./liveUpdate";
import { handleOAuthReturnUrl } from "./oauth";
import { collectScreenWatchReplies } from "./screenWatch";

function handleIncomingUrl(url: string): void {
  handleOAuthReturnUrl(url).catch((err) => console.error("[NativeApp] 處理授權回傳失敗:", err));
}

export function initNativeApp(): void {
  // 最先做：告訴熱更新套件這份網頁開得起來，再到背景檢查新版
  initLiveUpdate();
  installNativeDownloadShim();

  // 背景中定時器不會跑，回到前景時補上自動備份
  App.addListener("resume", () => {
    resumeAutoBackup().catch((err) => console.warn("[NativeApp] 補自動備份失敗:", err));
    // 分享螢幕期間角色在背景說的話，回到 App 時寫進聊天
    void collectScreenWatchReplies();
  });
  // 剛開 App 時角色可能還沒載入，晚一點再收；收不到的下次回到前景再收
  setTimeout(() => void collectScreenWatchReplies(), 5000);

  // 網頁版一開就問通知權限（storagePersistence），App 裡沒有 Notification API，改問原生的
  void pushNotificationService.refreshPermission().then((permission) => {
    if (permission === "default") void pushNotificationService.requestPermission();
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
