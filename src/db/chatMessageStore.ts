/**
 * chatMessages CRUD 操作層
 *
 * v24 架構：訊息從 chats.messages 拆分到獨立的 chatMessages 表，
 * 每條訊息一筆記錄，以 message.id 為主鍵，chatId 為索引。
 *
 * 好處：
 * 1. 追加訊息只需 put 新記錄，不需讀取整個聊天 → 消除競態條件
 * 2. 保存聊天 metadata（updatedAt、unreadCount 等）不需寫入所有訊息 → 減少 IO
 * 3. 未來可支援分頁載入 → 減少記憶體用量
 */

import type { ChatMessage } from "@/types/chat";
import { getDatabase, DB_STORES } from "@/db/database";
import type { StoredChatMessage } from "@/db/database";

// 重新匯出供外部使用
export type { StoredChatMessage } from "@/db/database";

/**
 * 載入指定聊天的所有訊息（按 createdAt 排序）
 */
export async function loadChatMessages(
  chatId: string,
): Promise<ChatMessage[]> {
  const db = await getDatabase();
  const records = await db.getAllFromIndex(
    "chatMessages",
    "by-chatId",
    chatId,
  );
  // 按 createdAt 升序排列，確保訊息順序正確
  records.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  return records;
}

/**
 * 同步指定聊天的訊息（智慧合併，保護背景服務追加的訊息）
 *
 * 策略：
 * - 用戶刪除的訊息（在 IDB 中但不在 incoming 中，且 createdAt <= snapshotTime）→ 刪除
 * - 背景服務追加的訊息（不在 incoming 中，但 createdAt > snapshotTime）→ 保留
 * - incoming 中的訊息 → 全部 put（可能是新增或編輯）
 *
 * @param snapshotTime ChatScreen 最後載入訊息的時間戳。若不傳，退化為全量替換（匯入場景）
 */
export async function saveChatMessages(
  chatId: string,
  messages: ChatMessage[],
  snapshotTime?: number,
): Promise<void> {
  const db = await getDatabase();
  const tx = db.transaction("chatMessages", "readwrite");
  const store = tx.objectStore("chatMessages");
  const index = store.index("by-chatId");

  // 建立 incoming 訊息 ID 集合
  const incomingIds = new Set<string>();
  for (const msg of messages) {
    if (msg?.id) incomingIds.add(msg.id);
  }

  // 遍歷 IDB 中該聊天的所有訊息
  let cursor = await index.openCursor(chatId);
  while (cursor) {
    const existing = cursor.value;
    if (!incomingIds.has(existing.id)) {
      // 這條訊息不在 incoming 中
      if (
        snapshotTime != null &&
        (existing.createdAt || 0) > snapshotTime
      ) {
        // 背景服務在快照之後追加的 → 保留，不刪除
      } else {
        // 用戶刪除的，或全量替換模式 → 刪除
        await cursor.delete();
      }
    }
    cursor = await cursor.continue();
  }

  // 寫入所有 incoming 訊息（put = insert or update）
  for (const msg of messages) {
    if (!msg || !msg.id) continue;
    await store.put({ ...msg, chatId } as StoredChatMessage);
  }

  await tx.done;
}

/**
 * 追加訊息到指定聊天（不需讀取現有訊息，消除競態條件）
 * 這是最安全的寫入方式，適用於 ProactiveMessage、CloudPush 等背景服務
 */
export async function appendChatMessages(
  chatId: string,
  newMessages: ChatMessage[],
): Promise<void> {
  if (!newMessages.length) return;
  const db = await getDatabase();
  const tx = db.transaction("chatMessages", "readwrite");
  const store = tx.objectStore("chatMessages");

  for (const msg of newMessages) {
    if (!msg || !msg.id) continue;
    await store.put({ ...msg, chatId } as StoredChatMessage);
  }

  await tx.done;
}

/**
 * 刪除指定聊天的所有訊息（用於刪除聊天時級聯清理）
 */
export async function deleteChatMessagesForChat(
  chatId: string,
): Promise<void> {
  const db = await getDatabase();
  const tx = db.transaction("chatMessages", "readwrite");
  const index = tx.objectStore("chatMessages").index("by-chatId");
  let cursor = await index.openCursor(chatId);
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

/**
 * 刪除指定的單條訊息
 */
export async function deleteChatMessage(messageId: string): Promise<void> {
  const db = await getDatabase();
  await db.delete("chatMessages", messageId);
}

/**
 * 取得指定聊天的訊息數量（不載入全部訊息）
 */
export async function getChatMessageCount(chatId: string): Promise<number> {
  const db = await getDatabase();
  const index = db
    .transaction("chatMessages", "readonly")
    .objectStore("chatMessages")
    .index("by-chatId");
  return index.count(chatId);
}

/**
 * 更新聊天 metadata（不觸碰訊息），用於只需更新 updatedAt、unreadCount 等場景
 */
export async function updateChatMetadataOnly(
  chatId: string,
  updates: Record<string, unknown>,
): Promise<void> {
  const db = await getDatabase();
  const chat = await db.get("chats", chatId);
  if (!chat) return;

  const updated = { ...chat, ...updates, messages: [] } as any;
  await db.put("chats", updated);
}
