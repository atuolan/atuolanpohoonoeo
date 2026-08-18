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

export interface ChatMessageCursor {
  createdAt: number;
  id: string;
}

export interface ChatMessagePage {
  messages: ChatMessage[];
  /** Cursor for the next request that should load older messages. */
  before: ChatMessageCursor | null;
  hasMore: boolean;
}

export interface ChatMessageStats {
  totalMessages: number;
  userMessages: number;
  aiMessages: number;
  systemMessages: number;
  memberMessageCounts: Record<string, number>;
}

function messageSortKey(message: Pick<ChatMessage, "createdAt" | "id">): [number, string] {
  const createdAt = Number(message.createdAt);
  return [Number.isFinite(createdAt) ? createdAt : 0, message.id];
}

function compareMessageKeys(
  left: [number, string],
  right: [number, string],
): number {
  return left[0] - right[0] || left[1].localeCompare(right[1]);
}

/**
 * Legacy records may not have createdAt, so they are absent from the
 * compound index. Scan the chatId index with a bounded in-memory page rather
 * than loading the full chat into the renderer.
 */
async function loadChatMessagesPageByChatId(
  db: Awaited<ReturnType<typeof getDatabase>>,
  chatId: string,
  pageSize: number,
  before?: ChatMessageCursor | null,
): Promise<ChatMessagePage> {
  const index = db
    .transaction("chatMessages", "readonly")
    .objectStore("chatMessages")
    .index("by-chatId");
  const records: StoredChatMessage[] = [];
  let eligibleCount = 0;
  let cursor = await index.openCursor(chatId, "next");
  while (cursor) {
    const value = cursor.value as StoredChatMessage;
    const key = messageSortKey(value);
    if (!before || compareMessageKeys(key, [before.createdAt, before.id]) < 0) {
      eligibleCount++;
      let low = 0;
      let high = records.length;
      while (low < high) {
        const middle = (low + high) >> 1;
        if (compareMessageKeys(messageSortKey(records[middle]), key) <= 0) {
          low = middle + 1;
        } else {
          high = middle;
        }
      }
      records.splice(low, 0, value);
      if (records.length > pageSize) records.shift();
    }
    cursor = await cursor.continue();
  }

  const first = records[0];
  return {
    messages: records,
    before:
      records.length === pageSize && first
        ? { createdAt: messageSortKey(first)[0], id: first.id }
        : null,
    hasMore: eligibleCount > pageSize,
  };
}

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
  records.sort(
    (a, b) =>
      (a.createdAt || 0) - (b.createdAt || 0) || a.id.localeCompare(b.id),
  );
  return records;
}

/**
 * Calculate chat statistics from the chatId index without loading every
 * message into renderer memory. Legacy records may only have sender/is_user,
 * while newer records can also carry an explicit role.
 */
export async function getChatMessageStats(
  chatId: string,
): Promise<ChatMessageStats> {
  const db = await getDatabase();
  const index = db
    .transaction("chatMessages", "readonly")
    .objectStore("chatMessages")
    .index("by-chatId");
  const stats: ChatMessageStats = {
    totalMessages: 0,
    userMessages: 0,
    aiMessages: 0,
    systemMessages: 0,
    memberMessageCounts: {},
  };

  let cursor = await index.openCursor(chatId);
  while (cursor) {
    const message = cursor.value as StoredChatMessage & {
      role?: "user" | "ai" | "system";
    };
    const role =
      message.role === "user" || message.role === "ai" || message.role === "system"
        ? message.role
        : message.sender === "user" || message.is_user === true
          ? "user"
          : message.sender === "assistant"
            ? "ai"
            : "system";

    stats.totalMessages += 1;
    if (role === "user") {
      stats.userMessages += 1;
    } else if (role === "ai") {
      stats.aiMessages += 1;
      const memberId = (message as any).senderCharacterId;
      if (memberId) {
        stats.memberMessageCounts[memberId] =
          (stats.memberMessageCounts[memberId] || 0) + 1;
      }
    } else {
      stats.systemMessages += 1;
    }

    cursor = await cursor.continue();
  }

  return stats;
}

/**
 * Load the newest page (or the page immediately before `before`) without
 * materializing the rest of the chat in renderer memory.
 */
export async function loadChatMessagesPage(
  chatId: string,
  limit: number,
  before?: ChatMessageCursor | null,
): Promise<ChatMessagePage> {
  const pageSize = Math.max(1, Math.floor(limit));
  const db = await getDatabase();
  try {
    const tx = db.transaction("chatMessages", "readonly");
    const store = tx.objectStore("chatMessages");
    const chatIndex = store.index("by-chatId");
    const index = store.index("by-chat-createdAt-id");
    const lower: [string, number, string] = [
      chatId,
      Number.MIN_SAFE_INTEGER,
      "",
    ];
    const upper: [string, number, string] = [
      chatId,
      Number.MAX_SAFE_INTEGER,
      "\uffff",
    ];
    const fullRange = IDBKeyRange.bound(lower, upper);
    const range = before
      ? IDBKeyRange.bound(
          lower,
          [chatId, before.createdAt, before.id],
          false,
          true,
        )
      : fullRange;

    // A compound index silently omits records with missing key-path fields.
    // Detect that case before returning an incomplete page.
    const [chatCount, indexedCount] = await Promise.all([
      chatIndex.count(chatId),
      index.count(fullRange),
    ]);
    if (chatCount !== indexedCount) {
      return loadChatMessagesPageByChatId(db, chatId, pageSize, before);
    }

    const records: StoredChatMessage[] = [];
    let cursor = await index.openCursor(range, "prev");
    while (cursor && records.length < pageSize) {
      records.push(cursor.value);
      cursor = await cursor.continue();
    }

    records.reverse();
    const first = records[0];
    return {
      messages: records,
      before:
        records.length === pageSize && first
          ? { createdAt: messageSortKey(first)[0], id: first.id }
          : null,
      hasMore: records.length === pageSize,
    };
  } catch (error) {
    // Existing databases can be opened before the v28 index migration. Keep
    // the first paint paged even when that index is not yet available.
    console.warn("[chatMessageStore] compound paging index unavailable; using chatId cursor", error);
    return loadChatMessagesPageByChatId(db, chatId, pageSize, before);
  }
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
    const existing = await store.get(msg.id);
    if (existing?.chatId && existing.chatId !== chatId) {
      console.warn("[chatMessageStore] skip cross-chat message overwrite", {
        messageId: msg.id,
        existingChatId: existing.chatId,
        incomingChatId: chatId,
      });
      continue;
    }
    await store.put({ ...msg, chatId } as StoredChatMessage);
  }

  await tx.done;
}

/**
 * Upsert only the supplied records. This is the write path for a paged UI:
 * records outside the current window remain untouched in IndexedDB.
 */
export async function upsertChatMessages(
  chatId: string,
  messages: ChatMessage[],
): Promise<void> {
  if (!messages.length) return;
  const db = await getDatabase();
  const tx = db.transaction("chatMessages", "readwrite");
  const store = tx.objectStore("chatMessages");
  for (const msg of messages) {
    if (!msg || !msg.id) continue;
    const existing = await store.get(msg.id);
    if (existing?.chatId && existing.chatId !== chatId) {
      console.warn("[chatMessageStore] skip cross-chat message overwrite", {
        messageId: msg.id,
        existingChatId: existing.chatId,
        incomingChatId: chatId,
      });
      continue;
    }
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
    const existing = await store.get(msg.id);
    if (existing?.chatId && existing.chatId !== chatId) {
      console.warn("[chatMessageStore] skip cross-chat message overwrite", {
        messageId: msg.id,
        existingChatId: existing.chatId,
        incomingChatId: chatId,
      });
      continue;
    }
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
export async function deleteChatMessage(
  messageId: string,
  chatId?: string,
): Promise<boolean> {
  const db = await getDatabase();
  const existing = await db.get("chatMessages", messageId);
  if (!existing || (chatId && existing.chatId !== chatId)) {
    return false;
  }
  await db.delete("chatMessages", messageId);
  return true;
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
