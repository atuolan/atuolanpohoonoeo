/**
 * 系統通知類型定義
 */

/** 通知類型 */
export type NotificationType =
  | "qzone_post" // 角色發了噗浪
  | "qzone_comment" // 角色回覆了噗浪
  | "chat_message" // 角色回覆訊息（非聊天頁面）
  | "chat_summary" // 聊天總結 +1
  | "diary_entry" // 角色寫了日記
  | "fishing_stamina" // 釣魚耐力值已滿
  | "fishing_daily" // 釣魚 24h 上限
  | "gift_received" // 收到禮物
  | "incoming_call" // 來電通知
  | "friend_request" // 角色發送好友申請
  | "friend_accepted" // 好友申請被接受
  | "friend_rejected" // 好友申請被拒絕
  | "apology_food" // 道歉外賣送達
  | "char_blocked" // 角色封鎖了用戶
  | "char_unblocked" // 角色解除封鎖
  | "system"; // 系統通知

/** 通知優先級 */
export type NotificationPriority = "low" | "normal" | "high";

/** 通知項目 */
export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  /** 相關角色 ID */
  characterId?: string;
  /** 相關角色名稱 */
  characterName?: string;
  /** 相關角色頭像 */
  characterAvatar?: string;
  /** 相關聊天 ID */
  chatId?: string;
  /** 優先級 */
  priority: NotificationPriority;
  /** 創建時間 */
  createdAt: number;
  /** 是否已讀 */
  read: boolean;
  /** 點擊後的導航目標 */
  navigateTo?: string;
  /** 額外數據 */
  data?: Record<string, any>;
}

/** 通知設定 */
export interface NotificationSettings {
  /** 是否啟用通知 */
  enabled: boolean;
  /** 是否啟用系統推播通知（PWA） */
  pushEnabled: boolean;
  /** 通知顯示時長（毫秒） */
  duration: number;
  /** 最大同時顯示數量 */
  maxVisible: number;
  /** 各類型通知開關 */
  typeSettings: {
    [key in NotificationType]: boolean;
  };
}

/** 預設通知設定 */
export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: true,
  pushEnabled: true,
  duration: 4000,
  maxVisible: 3,
  typeSettings: {
    qzone_post: true,
    qzone_comment: true,
    chat_message: true,
    chat_summary: true,
    diary_entry: true,
    fishing_stamina: true,
    fishing_daily: true,
    gift_received: true,
    incoming_call: true,
    friend_request: true,
    friend_accepted: true,
    friend_rejected: true,
    apology_food: true,
    char_blocked: true,
    char_unblocked: true,
    system: true,
  },
};
