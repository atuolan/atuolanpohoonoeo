import { db, DB_STORES } from "@/db/database";

/**
 * AI 介面美化助手對話紀錄的持久化層
 *
 * 存放於 IndexedDB 的 settings（通用 key-value）store，
 * 單一 key 存整段對話陣列。相較 localStorage 容量大得多，
 * 適合可能夾帶參考圖 base64 的對話內容。
 */

const HISTORY_KEY = "ai-theme-chat-history";

/**
 * 載入對話紀錄。失敗或無資料時回空陣列。
 * 泛型 T 由呼叫端指定訊息型別。
 */
export async function loadThemeChatHistory<T>(): Promise<T[]> {
  try {
    await db.init();
    const stored = await db.get<T[]>(DB_STORES.SETTINGS, HISTORY_KEY);
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

/**
 * 寫入對話紀錄（整段覆蓋）。IndexedDB 不可用時靜默略過。
 */
export async function saveThemeChatHistory<T>(messages: T[]): Promise<void> {
  try {
    await db.init();
    await db.put(DB_STORES.SETTINGS, messages, HISTORY_KEY);
  } catch {
    // 資料庫不可用時靜默略過，不阻斷 UI
  }
}

/**
 * 清空對話紀錄。
 */
export async function clearThemeChatHistory(): Promise<void> {
  try {
    await db.init();
    await db.delete(DB_STORES.SETTINGS, HISTORY_KEY);
  } catch {
    // 靜默略過
  }
}

export { HISTORY_KEY as THEME_CHAT_HISTORY_KEY };
