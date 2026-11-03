/**
 * 主頁 App 圖示的未讀紅點
 *
 * - 訊息：所有聊天的未讀數加總（chat.unreadCount）
 * - 空間：還沒看的噗浪發文、留言通知
 *
 * 之後像素房間裡「有新東西的物件」也讀這裡。
 */
import { CHAT_UNREAD_CHANGED_EVENT, loadAllChats } from "@/storage/chatStorage";
import type { NotificationItem, NotificationType } from "@/types/notification";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { useNotificationStore } from "./notification";

const CHAT_APPENDED_EVENT = "aguaphone:chat-messages-appended";

/** 用通知算紅點的 App：App id → 算哪些通知 */
export const NOTIFICATION_BADGE_TYPES: Record<string, NotificationType[]> = {
  space: ["qzone_post", "qzone_comment"],
};

export function sumChatUnread(chats: ReadonlyArray<{ unreadCount?: number }>): number {
  return chats.reduce((sum, c) => sum + Math.max(0, c.unreadCount || 0), 0);
}

export function countUnreadOfTypes(
  notifications: ReadonlyArray<Pick<NotificationItem, "type" | "read">>,
  types: ReadonlyArray<NotificationType>,
): number {
  return notifications.filter((n) => !n.read && types.includes(n.type)).length;
}

/** 紅點上的字：超過 99 顯示 99+ */
export function formatBadgeCount(n: number): string {
  return n > 99 ? "99+" : String(n);
}

export const useHomeBadgesStore = defineStore("homeBadges", () => {
  const chatUnread = ref(0);
  let listening = false;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;

  async function refreshChats(): Promise<void> {
    try {
      chatUnread.value = sumChatUnread(await loadAllChats());
    } catch (err) {
      console.warn("[homeBadges] 讀聊天未讀數失敗", err);
    }
  }

  /** 短時間內連續變動只重讀一次 */
  function scheduleRefresh(): void {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      void refreshChats();
    }, 300);
  }

  /** 開始聽未讀數變動；重複呼叫只會重讀一次 */
  function start(): void {
    void refreshChats();
    if (listening || typeof window === "undefined") return;
    listening = true;
    window.addEventListener(CHAT_UNREAD_CHANGED_EVENT, scheduleRefresh);
    window.addEventListener(CHAT_APPENDED_EVENT, scheduleRefresh);
  }

  /** 每個 App id 的未讀數，沒有的就是 0 */
  const badges = computed<Record<string, number>>(() => {
    const notificationStore = useNotificationStore();
    const out: Record<string, number> = { message: chatUnread.value };
    for (const [id, types] of Object.entries(NOTIFICATION_BADGE_TYPES)) {
      out[id] = countUnreadOfTypes(notificationStore.notifications, types);
    }
    return out;
  });

  const total = computed(() => Object.values(badges.value).reduce((a, b) => a + b, 0));

  return { chatUnread, badges, total, start, refreshChats };
});
