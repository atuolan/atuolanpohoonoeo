/**
 * App 裡的系統通知。
 *
 * Android WebView、iOS WKWebView 都沒有網頁的 Notification API（iOS 只有加入主畫面的 PWA 才有），
 * App 裡改用原生的本機通知（@capacitor/local-notifications）。只在 App 裡動態載入。
 */
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";

/** Android 的通知類別：預設類別的重要性不會跳橫幅，訊息要用高重要性 */
const MESSAGE_CHANNEL_ID = "messages";

let appActive = true;
void App.getState()
  .then(({ isActive }) => {
    appActive = isActive;
  })
  .catch(() => {});
void App.addListener("appStateChange", ({ isActive }) => {
  appActive = isActive;
});

let channelReady: Promise<void> | null = null;

function ensureChannel(): Promise<void> {
  if (Capacitor.getPlatform() !== "android") return Promise.resolve();
  channelReady ??= LocalNotifications.createChannel({
    id: MESSAGE_CHANNEL_ID,
    name: "角色訊息",
    description: "角色訊息、噗浪、來電等提醒",
    importance: 4,
    visibility: 1,
    vibration: true,
  }).catch((err) => {
    channelReady = null;
    console.warn("[NativeNotification] 建立通知類別失敗:", err);
  });
  return channelReady;
}

/** App 在前景（使用者正看著） */
export function isAppInForeground(): boolean {
  return appActive;
}

function toPermission(state: string): NotificationPermission {
  if (state === "granted") return "granted";
  if (state === "denied") return "denied";
  return "default";
}

export async function checkNativeNotificationPermission(): Promise<NotificationPermission> {
  const { display } = await LocalNotifications.checkPermissions();
  return toPermission(display);
}

export async function requestNativeNotificationPermission(): Promise<NotificationPermission> {
  const { display } = await LocalNotifications.requestPermissions();
  return toPermission(display);
}

/** 通知 ID 要是正的 32 位元整數；同一個 tag（例如同一通來電）用同一個 ID，新的會蓋掉舊的 */
function notificationId(tag: string): number {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) | 0;
  return hash & 0x7fffffff || 1;
}

export async function showNativeNotification(options: {
  tag: string;
  title: string;
  body: string;
  extra?: Record<string, unknown>;
}): Promise<void> {
  await ensureChannel();
  await LocalNotifications.schedule({
    notifications: [
      {
        id: notificationId(options.tag),
        title: options.title,
        body: options.body,
        extra: options.extra,
        channelId: MESSAGE_CHANNEL_ID,
      },
    ],
  });
}

/**
 * 點通知打開 App 時呼叫 handler（帶著發通知時的 extra）。
 * App 被點通知冷啟動時，事件會留到這裡註冊監聽才送出。
 */
export function onNativeNotificationTap(handler: (extra: Record<string, unknown>) => void): void {
  void LocalNotifications.addListener("localNotificationActionPerformed", ({ notification }) => {
    handler((notification.extra as Record<string, unknown> | undefined) ?? {});
  });
}
