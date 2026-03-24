/**
 * PWA 系統推播通知服務
 * 使用瀏覽器原生 Notification API 發送系統通知
 * 當 app 在背景或使用者不在當前頁面時，會顯示系統級通知
 *
 * 策略：
 * 1. 優先透過 Service Worker 發送（後台更可靠）
 * 2. SW 不可用時 fallback 到 new Notification()
 * 3. 後台時透過 postMessage 通知 SW 發送，避免主線程被節流
 */

import type { NotificationItem } from "@/types/notification";

/** 通知類型對應的圖示 emoji（用於系統通知的 badge） */
const TYPE_BADGES: Record<string, string> = {
  qzone_post: "📝",
  qzone_comment: "💬",
  chat_message: "💌",
  chat_summary: "📋",
  diary_entry: "📖",
  fishing_stamina: "🎣",
  fishing_daily: "🎣",
  gift_received: "🎁",
  incoming_call: "📞",
  system: "🔔",
};

class PushNotificationService {
  private _permission: NotificationPermission = "default";
  /** 快取 SW registration，避免每次都 await ready */
  private _swReg: ServiceWorkerRegistration | null = null;

  /** 同步最新通知權限（處理權限在其他模組被請求的情況） */
  private syncPermission(): void {
    if (!this.isSupported) return;
    this._permission = Notification.permission;
  }

  /** 當前權限狀態 */
  get permission(): NotificationPermission {
    return this._permission;
  }

  /** 是否支援通知 */
  get isSupported(): boolean {
    return "Notification" in window;
  }

  /** 是否已授權 */
  get isGranted(): boolean {
    return this._permission === "granted";
  }

  /** 初始化：同步當前權限狀態 + 預取 SW registration */
  init(): void {
    if (this.isSupported) {
      this._permission = Notification.permission;
    }
    // 預取 SW registration（不阻塞）
    this.cacheSWRegistration();
  }

  /** 預取並快取 SW registration */
  private async cacheSWRegistration(): Promise<void> {
    try {
      if ("serviceWorker" in navigator) {
        this._swReg = await navigator.serviceWorker.ready;
        console.log("[PushNotification] SW registration 已快取");
      }
    } catch {
      // 忽略
    }
  }

  /** 請求通知權限 */
  async requestPermission(): Promise<NotificationPermission> {
    if (!this.isSupported) {
      console.warn("[PushNotification] 此瀏覽器不支援 Notification API");
      return "denied";
    }

    try {
      const result = await Notification.requestPermission();
      this._permission = result;
      console.log("[PushNotification] 權限狀態:", result);
      return result;
    } catch (error) {
      console.error("[PushNotification] 請求權限失敗:", error);
      return "denied";
    }
  }

  /**
   * 發送系統通知
   * 只在頁面不可見（背景）或 document 沒有 focus 時才發送
   */
  send(item: NotificationItem): void {
    if (!this.isSupported) {
      console.warn("[PushNotification] 瀏覽器不支援 Notification API，跳過");
      return;
    }

    // 每次發送前都同步一次，避免權限在別處被更新後仍使用舊快取
    this.syncPermission();
    if (!this.isGranted) {
      console.warn("[PushNotification] 通知權限未授權，當前狀態:", this._permission);
      return;
    }

    // 來電通知即使在前景也允許發送（使用者常需要鈴聲/系統提示）
    const shouldForceForeground = item.type === "incoming_call";

    // 非來電通知僅在頁面不可見或無 focus 時發送
    if (
      !shouldForceForeground &&
      document.visibilityState === "visible" &&
      document.hasFocus()
    ) {
      console.log("[PushNotification] 頁面在前台且有焦點，跳過系統通知");
      return;
    }

    const badge = TYPE_BADGES[item.type] || "🔔";
    const title = `${badge} ${item.title}`;
    const body = item.message;

    console.log("[PushNotification] 準備發送通知:", {
      title,
      body,
      visibility: document.visibilityState,
      hasFocus: document.hasFocus(),
      hasSW: !!this._swReg,
      swActive: !!this._swReg?.active,
    });

    // 優先透過 SW 發送（後台時更可靠）；失敗時 fallback 到 Notification API
    this.sendViaSW(title, body, item).catch((err) => {
      console.warn("[PushNotification] SW 發送失敗，fallback 到 Notification API:", err);
      this.sendViaAPI(title, body, item);
    });
  }

  /** 透過 Notification API 直接發送 */
  private sendViaAPI(
    title: string,
    body: string,
    item: NotificationItem,
  ): void {
    try {
      const tag =
        item.type === "incoming_call" && item.chatId
          ? `incoming-call-${item.chatId}`
          : item.id;

      const notification = new Notification(title, {
        body,
        tag,
        icon: item.characterAvatar || undefined,
        silent: false,
        requireInteraction: item.type === "incoming_call",
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
      };

      setTimeout(() => notification.close(), 6000);
    } catch (error) {
      console.warn("[PushNotification] Notification API 失敗:", error);
    }
  }

  /** 透過 Service Worker 發送通知（後台更可靠） */
  private async sendViaSW(
    title: string,
    body: string,
    item: NotificationItem,
  ): Promise<void> {
    const reg = this._swReg || (await navigator.serviceWorker?.ready);
    if (!reg) throw new Error("SW not available");

    const tag =
      item.type === "incoming_call" && item.chatId
        ? `incoming-call-${item.chatId}`
        : item.id;

    const notificationOptions = {
      body,
      tag,
      icon: item.characterAvatar || "/icons/icon-192x192.png",
      silent: false,
      renotify: true,
      requireInteraction: item.type === "incoming_call",
      data: {
        type: item.type,
        chatId: item.chatId,
        navigateTo: item.navigateTo,
        reason: item.data?.reason,
      },
    };

    // 後台時優先透過 postMessage 讓 SW 自己發送（更可靠）
    if (document.visibilityState === "hidden" && reg.active) {
      reg.active.postMessage({
        type: "SHOW_NOTIFICATION",
        title,
        options: notificationOptions,
      });
      return;
    }

    // 前台或 SW 不活躍時直接用 showNotification
    await reg.showNotification(title, notificationOptions);
  }
}

/** 單例 */
export const pushNotificationService = new PushNotificationService();
