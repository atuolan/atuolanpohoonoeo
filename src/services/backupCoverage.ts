/**
 * 備份涵蓋範圍：哪些資料進備份、哪些刻意不帶、為什麼。
 *
 * - aguaphone-db 每新增一個表都要在 STORE_BACKUP_PLAN 登記，漏登記型別檢查就過不了；
 *   標成 "backup" 的表由 backupRoundTrip.test.ts 實際打包、清空、還原、逐筆比對。
 * - appSettings、settings（key-value）與 localStorage 是「預設全收」，
 *   只有下面列出的 key 不帶——新功能存的東西自動會進備份。
 */
import type { DB_STORES } from "@/db/database";

export type StoreName = (typeof DB_STORES)[keyof typeof DB_STORES];

/** "backup" = 進備份；{ skip } = 刻意不帶，寫下原因 */
export type StoreBackupPlan = "backup" | { skip: string };

// 用 satisfies 而不是型別註記：保留每個值的字面型別，測試才能在型別層面挑出 "backup" 的表
export const STORE_BACKUP_PLAN = {
  themes: "backup",
  layouts: "backup",
  characterAffections: "backup",
  settings: "backup",
  promptLibrary: "backup",
  characters: "backup",
  lorebooks: "backup",
  chats: "backup",
  appSettings: "backup",
  stickers: "backup",
  importantEvents: "backup",
  summaries: "backup",
  diaries: "backup",
  qzonePosts: "backup",
  // 聊天圖片跟著訊息打包；圖庫（非 chatimg_ 開頭）另外收在 imageGallery
  imageCache: "backup",
  pendingCalls: "backup",
  callHistory: "backup",
  gameStates: "backup",
  holidayRecords: "backup",
  calendarEvents: "backup",
  authState: { skip: "這台裝置的登入狀態，換裝置要重新驗證" },
  rendererRules: "backup",
  books: "backup",
  bookProgress: "backup",
  // 錄音：分包階段逐筆寫成 media/ 檔，每包附 audio-blobs.json
  "audio-blobs": "backup",
  chatAffinityStates: "backup",
  vectorEmbeddings: "backup",
  peekPhoneData: "backup",
  // 跟著聊天一起打包（chats/<id>.json）
  chatMessages: "backup",
  announcementAcks: "backup",
  promptOverrides: { skip: "已停用的表，專屬預設已改存在各聊天的 chatVariables" },
  favoriteAudios: "backup",
  favoriteAudioGroups: "backup",
} satisfies Record<StoreName, StoreBackupPlan>;

/** 登記為 "backup" 的表 */
export type BackedUpStoreName = {
  [K in StoreName]: (typeof STORE_BACKUP_PLAN)[K] extends "backup" ? K : never;
}[StoreName];

/** appSettings 裡另外放在 backup.json 頂層的 key（settings / userData） */
export const APP_SETTINGS_TOP_LEVEL_KEYS = ["main-settings", "user-data"] as const;

/** appSettings 裡不進備份的 key；其他 key 全收進 appSettingsExtra */
export const APP_SETTINGS_SKIPPED_KEYS: Record<string, string> = {
  "github-backup-settings": "含 GitHub token；從 GitHub 還原之前本來就要先設定好",
  "self-hosted-sync-settings": "自架同步的登入資訊與這台裝置的 deviceId",
  "self-hosted-sync-deleted-entities": "自架同步的刪除紀錄，屬於同步狀態",
  "cloud-push-settings": "雲端推播的綁定與排程跟著這台裝置，換裝置要重新開",
  "admin-state": "這台裝置記住的管理員身分",
  "book-shelf-index": "從 books 推算的快取，打開書架會自動重建",
};

/** settings（key-value）表裡不進備份的 key */
export const SETTINGS_SKIPPED_KEYS: Record<string, string> = {
  "autoBackup-dirHandle":
    "備份資料夾的存取權只在這台裝置有效；序列化後只剩空物件，還原會蓋掉這台的資料夾",
  "autoBackup-settings": "這台裝置的自動備份排程，跟資料夾綁在一起",
};

/** localStorage 裡不進備份的 key */
export const LOCAL_STORAGE_SKIPPED_KEYS: Record<string, string> = {
  aguaphone_characters: "資料庫打不開時的角色備援，正式資料在 IDB",
  aguaphone_lorebooks: "資料庫打不開時的世界書備援，正式資料在 IDB",
  aguaphone_auth_backup_v2: "這台裝置的登入狀態",
  discord_oauth_result: "Discord 登入的暫存結果",
  aguaphone_user_cleared_local_data: "這台裝置「使用者清過資料」的標記，會影響自動還原",
  aguaphone_storage_health: "這台裝置的儲存健康紀錄",
  phone_call_snapshot: "通話中的暫存快照",
  phone_missed_calls: "一小時內有效的未接來電計數",
  "ai-indicator-dock": "浮動按鈕的位置，依螢幕大小而定",
  "phone-call-widget-position": "通話列的位置，依螢幕大小而定",
};

/** localStorage 裡不進備份的 key 前綴 */
export const LOCAL_STORAGE_SKIPPED_PREFIXES: Record<string, string> = {
  "aguaphone:bg_generation:": "背景生成任務的輪詢狀態",
};

export function shouldBackupAppSettingsKey(id: string): boolean {
  return (
    !(APP_SETTINGS_TOP_LEVEL_KEYS as readonly string[]).includes(id) &&
    !(id in APP_SETTINGS_SKIPPED_KEYS)
  );
}

export function shouldBackupSettingsKey(key: string): boolean {
  return !(key in SETTINGS_SKIPPED_KEYS);
}

export function shouldBackupLocalStorageKey(key: string): boolean {
  if (key in LOCAL_STORAGE_SKIPPED_KEYS) return false;
  return !Object.keys(LOCAL_STORAGE_SKIPPED_PREFIXES).some((p) => key.startsWith(p));
}

/** 讀出要備份的 localStorage（key → 原始字串）；無法存取時回傳空物件 */
export function collectLocalStorageForBackup(): Record<string, string> {
  const result: Record<string, string> = {};
  try {
    if (typeof localStorage === "undefined") return result;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key === null || !shouldBackupLocalStorageKey(key)) continue;
      const value = localStorage.getItem(key);
      if (value !== null) result[key] = value;
    }
  } catch {
    // 隱私模式或被封鎖：沒有可備份的
  }
  return result;
}
