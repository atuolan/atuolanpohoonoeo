/**
 * 通知 Store
 * 管理系統通知的狀態和顯示
 */

import { getSetting, saveSetting } from "@/db/operations";
import { pushNotificationService } from "@/services/PushNotificationService";
import type {
    NotificationItem,
    NotificationPriority,
    NotificationSettings,
    NotificationType,
} from "@/types/notification";
import { DEFAULT_NOTIFICATION_SETTINGS } from "@/types/notification";
import { defineStore } from "pinia";
import { computed, ref } from "vue";

export const useNotificationStore = defineStore("notification", () => {
  // ============================================================
  // 狀態
  // ============================================================

  /** 所有通知列表 */
  const notifications = ref<NotificationItem[]>([]);

  /** 當前顯示的 Toast 通知 */
  const visibleToasts = ref<NotificationItem[]>([]);

  /** 通知設定 */
  const settings = ref<NotificationSettings>({
    ...DEFAULT_NOTIFICATION_SETTINGS,
    typeSettings: { ...DEFAULT_NOTIFICATION_SETTINGS.typeSettings },
  });

  /** 是否已載入設定 */
  const isLoaded = ref(false);

  /** 當前活躍的聊天 ID（用於判斷是否在聊天頁面） */
  const activeChatId = ref<string | null>(null);

  /** 正在看噗浪（噗浪自己有通知分頁，不用再跳 Toast） */
  const viewingQzone = ref(false);

  // ============================================================
  // 計算屬性
  // ============================================================

  /** 未讀通知數量 */
  const unreadCount = computed(() => {
    return notifications.value.filter((n) => !n.read).length;
  });

  /** 最近的通知（最多 50 條） */
  const recentNotifications = computed(() => {
    return [...notifications.value]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 50);
  });

  // ============================================================
  // 載入方法
  // ============================================================

  /** 載入設定 */
  async function loadSettings(): Promise<void> {
    try {
      const saved = await getSetting<NotificationSettings>(
        "notification-settings",
      );
      if (saved) {
        settings.value = {
          ...DEFAULT_NOTIFICATION_SETTINGS,
          ...saved,
          typeSettings: {
            ...DEFAULT_NOTIFICATION_SETTINGS.typeSettings,
            ...(saved.typeSettings || {}),
          },
        };
      }
      isLoaded.value = true;
      console.log("[Notification] 設定已載入");
    } catch (error) {
      console.error("[Notification] 載入設定失敗:", error);
    }
  }

  /** 保存設定 */
  async function saveSettings(): Promise<void> {
    try {
      const plain = JSON.parse(JSON.stringify(settings.value));
      await saveSetting("notification-settings", plain);
    } catch (error) {
      console.error("[Notification] 保存設定失敗:", error);
    }
  }

  // ============================================================
  // 通知操作
  // ============================================================

  /** 生成唯一 ID */
  function generateId(): string {
    return `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  type NotificationParams = {
    type: NotificationType;
    title: string;
    message: string;
    characterId?: string;
    characterName?: string;
    characterAvatar?: string;
    chatId?: string;
    priority?: NotificationPriority;
    navigateTo?: string;
    data?: Record<string, any>;
  };

  /**
   * 添加通知
   */
  function addNotification(params: NotificationParams): NotificationItem | null {
    console.log(
      "[Notification] addNotification called:",
      params.type,
      params.title,
    );

    const notification = buildNotification(params);
    if (!notification) return null;

    // 添加到通知列表
    notifications.value.unshift(notification);

    // 限制通知列表長度
    if (notifications.value.length > 100) {
      notifications.value = notifications.value.slice(0, 100);
    }

    // 顯示 Toast
    showToast(notification);

    // 發送系統推播通知（頁面在背景時）
    if (settings.value.pushEnabled) {
      console.log("[Notification] pushEnabled=true，呼叫 pushNotificationService.send()");
      pushNotificationService.send(notification);
    } else {
      console.log("[Notification] pushEnabled=false，跳過系統推播");
    }

    console.log("[Notification] 新通知:", notification.title);
    return notification;
  }

  /** 檢查通知與類型是否啟用，啟用才建出通知 */
  function buildNotification(params: NotificationParams): NotificationItem | null {
    // 檢查是否啟用通知
    if (!settings.value.enabled) {
      console.log("[Notification] 通知已停用");
      return null;
    }

    // 檢查該類型通知是否啟用（兼容舊版設定缺少新類型 key 的情況）
    const isTypeEnabled =
      settings.value.typeSettings[params.type] ??
      DEFAULT_NOTIFICATION_SETTINGS.typeSettings[params.type] ??
      true;
    if (!isTypeEnabled) {
      console.log("[Notification] 該類型通知已停用:", params.type);
      return null;
    }

    return {
      id: generateId(),
      type: params.type,
      title: params.title,
      message: params.message,
      characterId: params.characterId,
      characterName: params.characterName,
      characterAvatar: params.characterAvatar,
      chatId: params.chatId,
      priority: params.priority || "normal",
      createdAt: Date.now(),
      read: false,
      navigateTo: params.navigateTo,
      data: params.data,
    };
  }

  /**
   * 顯示 Toast 通知
   */
  function showToast(notification: NotificationItem): void {
    console.log(
      "[Notification] showToast called:",
      notification.title,
      "visibleToasts count:",
      visibleToasts.value.length,
    );

    // 檢查是否超過最大顯示數量
    if (visibleToasts.value.length >= settings.value.maxVisible) {
      // 移除最舊的
      visibleToasts.value.shift();
    }

    visibleToasts.value.push(notification);
    console.log(
      "[Notification] Toast added, new count:",
      visibleToasts.value.length,
    );

    scheduleToastDismiss(notification.id);
  }

  /** Toast 自動消失的計時器；合併通知更新同一個 Toast 時要重新計時 */
  const toastTimers = new Map<string, ReturnType<typeof setTimeout>>();

  function scheduleToastDismiss(id: string): void {
    const old = toastTimers.get(id);
    if (old) clearTimeout(old);
    toastTimers.set(
      id,
      setTimeout(() => dismissToast(id), settings.value.duration),
    );
  }

  /**
   * 關閉 Toast
   */
  function dismissToast(id: string): void {
    const timer = toastTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      toastTimers.delete(id);
    }
    const index = visibleToasts.value.findIndex((n) => n.id === id);
    if (index !== -1) {
      visibleToasts.value.splice(index, 1);
    }
  }

  // ============================================================
  // 合併通知（噗浪一批生成會一次冒出很多則）
  // ============================================================

  /** 同一組通知多久內算同一批 */
  const GROUP_WINDOW_MS = 10 * 60_000;
  /** 系統通知等這批停下來才發，連續進來只發一次 */
  const GROUP_PUSH_DELAY_MS = 2500;

  type GroupEntry = {
    name: string;
    text: string;
    avatar?: string;
    characterId?: string;
  };

  const groupPushTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /** 系統通知延後一下再發，同一組用同一個 tag，新的蓋掉舊的 */
  function sendGroupPush(groupKey: string, notification: NotificationItem): void {
    if (!settings.value.pushEnabled) return;
    const old = groupPushTimers.get(groupKey);
    if (old) clearTimeout(old);
    groupPushTimers.set(
      groupKey,
      setTimeout(() => {
        groupPushTimers.delete(groupKey);
        pushNotificationService.send({ ...notification, data: { ...notification.data } });
      }, GROUP_PUSH_DELAY_MS),
    );
  }

  /**
   * 加一則可合併的通知：同組、未讀、還在時間內的就併進去，
   * 通知列表只留一則、Toast 原地更新、系統通知整批只跳一則。
   */
  function addGroupedNotification(
    groupKey: string,
    params: Omit<NotificationParams, "title" | "message">,
    entry: GroupEntry,
    summarize: (entries: GroupEntry[]) => { title: string; message: string },
    opts: { quiet?: boolean } = {},
  ): NotificationItem | null {
    const now = Date.now();
    const existing = notifications.value.find(
      (n) =>
        n.data?.groupKey === groupKey &&
        !n.read &&
        now - (n.data?.groupStartedAt ?? n.createdAt) < GROUP_WINDOW_MS,
    );
    const entries: GroupEntry[] = [...(existing?.data?.entries ?? []), entry];
    const { title, message } = summarize(entries);
    const groupStartedAt: number = existing?.data?.groupStartedAt ?? now;
    const data = {
      ...params.data,
      groupKey,
      groupStartedAt,
      entries,
      pushTag: `${groupKey}-${groupStartedAt}`,
    };

    const notification = buildNotification({
      ...params,
      title,
      message,
      characterName: entry.name,
      characterAvatar: entry.avatar,
      characterId: entry.characterId,
      data,
    });
    if (!notification) return null;

    let target = notification;
    if (existing) {
      Object.assign(existing, {
        title,
        message,
        characterName: entry.name,
        characterAvatar: entry.avatar ?? existing.characterAvatar,
        characterId: entry.characterId ?? existing.characterId,
        createdAt: now,
        data,
      });
      target = existing;
      // 移到列表最上面
      const index = notifications.value.indexOf(existing);
      if (index > 0) {
        notifications.value.splice(index, 1);
        notifications.value.unshift(existing);
      }
    } else {
      notifications.value.unshift(notification);
      if (notifications.value.length > 100) {
        notifications.value = notifications.value.slice(0, 100);
      }
    }

    // 正在看噗浪就不跳 Toast；切到背景時的系統通知照發
    if (!opts.quiet) {
      if (visibleToasts.value.some((n) => n.id === target.id)) {
        scheduleToastDismiss(target.id);
      } else {
        showToast(target);
      }
    }
    sendGroupPush(groupKey, target);
    return target;
  }

  /** 「小明、小華、小美 等 5 人」 */
  function joinNames(entries: GroupEntry[]): string {
    const names = [...new Set(entries.map((e) => e.name))];
    const shown = names.slice(0, 3).join("、");
    return names.length > 3 ? `${shown} 等 ${names.length} 人` : shown;
  }

  /**
   * 標記通知為已讀
   */
  function markAsRead(id: string): void {
    const notification = notifications.value.find((n) => n.id === id);
    if (notification) {
      notification.read = true;
    }
  }

  /**
   * 標記所有通知為已讀
   */
  function markAllAsRead(): void {
    notifications.value.forEach((n) => {
      n.read = true;
    });
  }

  /**
   * 清除所有通知
   */
  function clearAll(): void {
    notifications.value = [];
    visibleToasts.value = [];
  }

  /**
   * 刪除單個通知
   */
  function removeNotification(id: string): void {
    const index = notifications.value.findIndex((n) => n.id === id);
    if (index !== -1) {
      notifications.value.splice(index, 1);
    }
    dismissToast(id);
  }

  // ============================================================
  // 頁面追蹤
  // ============================================================

  /**
   * 設置當前活躍的聊天 ID
   * 當進入聊天頁面時調用，離開時傳入 null
   */
  function setActiveChatId(chatId: string | null): void {
    activeChatId.value = chatId;
  }

  /**
   * 檢查是否在指定聊天頁面
   */
  function isInChat(chatId: string): boolean {
    return activeChatId.value === chatId;
  }

  // ============================================================
  // 便捷方法 - 各類型通知
  // ============================================================

  /** 正在看噗浪時呼叫，離開時傳 false */
  function setViewingQzone(viewing: boolean): void {
    viewingQzone.value = viewing;
  }

  /** 噗浪發文通知；短時間內的新噗合成一則 */
  function notifyQzonePost(
    characterName: string,
    characterAvatar?: string,
    characterId?: string,
    preview = "",
  ): NotificationItem | null {
    return addGroupedNotification(
      "qzone_post",
      { type: "qzone_post", navigateTo: "qzone" },
      { name: characterName, text: preview, avatar: characterAvatar, characterId },
      (entries) => {
        const last = entries[entries.length - 1];
        if (entries.length === 1) {
          return {
            title: `${last.name} 發了新噗`,
            message: last.text || "去噗浪看看",
          };
        }
        return {
          title: `噗浪 · ${entries.length} 則新噗`,
          message: joinNames(entries),
        };
      },
      { quiet: viewingQzone.value },
    );
  }

  /** 噗浪回應通知（追蹤中的噗）；短時間內的回應合成一則 */
  function notifyQzoneComment(
    characterName: string,
    characterAvatar?: string,
    characterId?: string,
    preview = "",
  ): NotificationItem | null {
    return addGroupedNotification(
      "qzone_comment",
      { type: "qzone_comment", navigateTo: "qzone" },
      { name: characterName, text: preview, avatar: characterAvatar, characterId },
      (entries) => {
        const last = entries[entries.length - 1];
        if (entries.length === 1) {
          return {
            title: `${last.name} 回應了噗`,
            message: last.text || "去噗浪看看",
          };
        }
        return {
          title: `噗浪 · ${entries.length} 則新回應`,
          message: last.text
            ? `${joinNames(entries)}｜${last.name}：${last.text}`
            : joinNames(entries),
        };
      },
      { quiet: viewingQzone.value },
    );
  }

  /** 聊天訊息通知（非聊天頁面時） */
  function notifyChatMessage(
    characterName: string,
    preview: string,
    chatId: string,
    characterId?: string,
    characterAvatar?: string,
  ): NotificationItem | null {
    const params: NotificationParams = {
      type: "chat_message",
      title: characterName,
      message: preview.length > 50 ? preview.slice(0, 50) + "..." : preview,
      characterName,
      characterAvatar,
      characterId,
      chatId,
      navigateTo: "chat",
    };

    // 正在該聊天頁面：不進通知列表、不跳 Toast。
    // 但停在聊天頁就切出 App／分頁時，聊天頁不會關，還是要發系統通知；
    // 前景就跳過這件事交給 PushNotificationService 判斷。
    if (activeChatId.value === chatId) {
      const notification = buildNotification(params);
      if (notification && settings.value.pushEnabled) {
        pushNotificationService.send(notification);
      }
      return null;
    }

    return addNotification(params);
  }

  /** 聊天總結通知 */
  function notifyChatSummary(
    characterName: string,
    chatId: string,
    characterId?: string,
  ): NotificationItem | null {
    return addNotification({
      type: "chat_summary",
      title: "聊天總結",
      message: `與 ${characterName} 的對話已生成新總結`,
      characterName,
      characterId,
      chatId,
      navigateTo: "chat",
    });
  }

  /** 日記通知 */
  function notifyDiaryEntry(
    characterName: string,
    characterAvatar?: string,
    characterId?: string,
    chatId?: string,
  ): NotificationItem | null {
    return addNotification({
      type: "diary_entry",
      title: "新日記",
      message: `${characterName} 寫了一篇日記`,
      characterName,
      characterAvatar,
      characterId,
      chatId,
      navigateTo: "chat",
    });
  }

  /** 釣魚耐力值已滿通知 */
  function notifyFishingStamina(): NotificationItem | null {
    return addNotification({
      type: "fishing_stamina",
      title: "釣魚",
      message: "魚竿耐久度已耗盡！",
      priority: "high",
      navigateTo: "game-center",
    });
  }

  /** 釣魚 24h 上限通知 */
  function notifyFishingDailyLimit(): NotificationItem | null {
    return addNotification({
      type: "fishing_daily",
      title: "釣魚",
      message: "已達到今日掛機上限（24小時）",
      navigateTo: "game-center",
    });
  }

  /** 收到禮物通知 */
  function notifyGiftReceived(
    giftName: string,
    fromCharacter: string,
  ): NotificationItem | null {
    return addNotification({
      type: "gift_received",
      title: "收到禮物",
      message: `${fromCharacter} 送了你 ${giftName}`,
      characterName: fromCharacter,
    });
  }

  /** 來電通知 */
  function notifyIncomingCall(
    characterName: string,
    reason: string,
    chatId: string,
    characterId?: string,
    characterAvatar?: string,
  ): NotificationItem | null {
    return addNotification({
      type: "incoming_call",
      title: `${characterName} 來電`,
      message: reason ? `來電原因：${reason}` : "你有一通來電",
      characterName,
      characterId,
      characterAvatar,
      chatId,
      priority: "high",
      navigateTo: "chat",
      data: {
        reason,
      },
    });
  }

  /** 系統通知 */
  function notifySystem(
    title: string,
    message: string,
  ): NotificationItem | null {
    return addNotification({
      type: "system",
      title,
      message,
    });
  }

  // ============================================================
  // 設定更新
  // ============================================================

  /** 更新設定 */
  async function updateSettings(
    updates: Partial<NotificationSettings>,
  ): Promise<void> {
    settings.value = { ...settings.value, ...updates };
    await saveSettings();
  }

  /** 切換通知類型開關 */
  async function toggleTypeEnabled(
    type: NotificationType,
    enabled: boolean,
  ): Promise<void> {
    settings.value.typeSettings[type] = enabled;
    await saveSettings();
  }

  /** 請求系統推播通知權限 */
  async function requestPushPermission(): Promise<NotificationPermission> {
    return pushNotificationService.requestPermission();
  }

  /** 系統推播通知權限狀態 */
  function getPushPermission(): NotificationPermission {
    return pushNotificationService.permission;
  }

  // ============================================================
  // 初始化
  // ============================================================

  async function init(): Promise<void> {
    await loadSettings();
    // 初始化系統推播通知
    pushNotificationService.init();
  }

  return {
    // 狀態
    notifications,
    visibleToasts,
    settings,
    isLoaded,
    activeChatId,
    viewingQzone,

    // 計算屬性
    unreadCount,
    recentNotifications,

    // 方法
    loadSettings,
    saveSettings,
    addNotification,
    showToast,
    dismissToast,
    markAsRead,
    markAllAsRead,
    clearAll,
    removeNotification,

    // 頁面追蹤
    setActiveChatId,
    isInChat,
    setViewingQzone,

    // 便捷方法
    notifyQzonePost,
    notifyQzoneComment,
    notifyChatMessage,
    notifyChatSummary,
    notifyDiaryEntry,
    notifyFishingStamina,
    notifyFishingDailyLimit,
    notifyGiftReceived,
    notifyIncomingCall,
    notifySystem,

    // 設定
    updateSettings,
    toggleTypeEnabled,
    requestPushPermission,
    getPushPermission,
    init,
  };
});
