/**
 * 角色狀態（<char-status>）的寫入與通知
 * 狀態存在聊天記錄上；聊天頁、主動訊息都走這裡寫入，主畫面的角色狀態卡靠事件即時更新
 */

import { loadChatById, saveChatMetadata } from "@/storage/chatStorage";
import type { CharStatus } from "@/types/chat";

export const CHAR_STATUS_CHANGED_EVENT = "aguaphone:char-status-changed";

export interface CharStatusChangedDetail {
  chatId: string;
  status: CharStatus;
}

/**
 * 把角色狀態寫進聊天記錄並通知畫面
 * @returns 寫入的狀態；聊天不存在或比資料庫裡的舊時回傳 null
 */
export async function saveCharStatus(
  chatId: string,
  status: CharStatus,
): Promise<CharStatus | null> {
  const chat = await loadChatById(chatId);
  if (!chat) return null;
  if ((chat.charStatus?.updatedAt || 0) > status.updatedAt) return null;

  // 訊息另外存在 chatMessages 表，這裡只寫聊天本身的資料
  await saveChatMetadata({ ...chat, messages: [], charStatus: status });

  try {
    window.dispatchEvent(
      new CustomEvent<CharStatusChangedDetail>(CHAR_STATUS_CHANGED_EVENT, {
        detail: { chatId, status },
      }),
    );
  } catch {
    // 忽略（非瀏覽器環境 / 測試環境）
  }
  return status;
}
