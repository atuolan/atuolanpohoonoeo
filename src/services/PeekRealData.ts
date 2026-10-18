/**
 * 讀偷窺手機要用的真資料：最近的聊天訊息、這段聊天的日記、他排好要打的電話。群聊沒有「跟使用者那串」，回傳空的
 */
import { db, DB_STORES, type DiaryEntry } from "@/db/database";
import { loadMessagePage } from "@/storage/chatMessageStorage";
import type { Chat } from "@/types/chat";
import type { PendingCall } from "@/types/incomingCall";
import { buildPeekRealData, type PeekRealData, type PeekRealDataOptions } from "@/utils/peekRealData";

/** 往回讀幾則：夠排最近 30 則對話和最近的交易 */
const MESSAGE_WINDOW = 300;

export function emptyPeekRealData(): PeekRealData {
  return { userThread: [], transactions: [], diary: [], meals: [], photos: [], pendingCalls: [] };
}

export async function loadPeekRealData(chat: Chat, options: PeekRealDataOptions): Promise<PeekRealData> {
  if (chat.isGroupChat) return emptyPeekRealData();
  const [page, diaries, pendingCalls] = await Promise.all([
    loadMessagePage(chat.id, MESSAGE_WINDOW),
    db.getAll<DiaryEntry>(DB_STORES.DIARIES),
    db.getAll<PendingCall>(DB_STORES.PENDING_CALLS).catch(() => [] as PendingCall[]),
  ]);
  return buildPeekRealData(
    page.messages,
    diaries.filter((d) => d.chatId === chat.id),
    options,
    {
      pendingCalls: pendingCalls.filter((c) => c.chatId === chat.id),
      hasAllMessages: !page.hasMore,
      chatCreatedAt: chat.createdAt,
    },
  );
}
