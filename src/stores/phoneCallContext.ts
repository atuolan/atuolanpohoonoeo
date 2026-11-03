/**
 * 通話開始時載入的上下文：對話總結、重要事件、通話前的聊天紀錄。
 * 語音、視訊、從快照恢復都走這裡，AI 在各種通話裡讀到的東西才會一致。
 */
import { db, DB_STORES } from "@/db/database";
import { loadChatById } from "@/storage/chatStorage";
import { loadMessages } from "@/storage/chatMessageStorage";
import { resolveSummaryReadCount, selectSummariesForPrompt } from "@/utils/summarySelection";

export interface CallSummary {
  id: string;
  content: string;
  createdAt: number;
  coveredUntil?: number;
  isImportant?: boolean;
}

export interface CallImportantEvent {
  id: string;
  content: string;
  category?: string;
  priority?: number;
}

export interface CallRecentChatMessage {
  role: "user" | "assistant";
  name: string;
  content: string;
  createdAt: number;
}

export interface CallContext {
  summaries: CallSummary[];
  importantEvents: CallImportantEvent[];
  recentChatHistory: CallRecentChatMessage[];
}

/** 通話前帶進來的聊天訊息數量 */
const RECENT_CHAT_LIMIT = 15;

export function emptyCallContext(): CallContext {
  return { summaries: [], importantEvents: [], recentChatHistory: [] };
}

/**
 * 讀出這通電話要用的上下文。每次都回傳全新的一份，
 * 讀取失敗的部分是空的，不會留著上一通電話（可能是別的角色）的資料。
 */
export async function loadCallContext(info: {
  chatId?: string;
  characterId: string;
}): Promise<CallContext> {
  const context = emptyCallContext();

  try {
    // 總結數量照這個聊天自己的「總結讀取」設定，跟聊天、主動訊息一致
    const chat = info.chatId
      ? await loadChatById(info.chatId).catch(() => undefined)
      : undefined;
    const readCount = resolveSummaryReadCount(chat?.summarySettings);

    const allSummaries = await db.getAll<any>(DB_STORES.SUMMARIES);
    context.summaries = selectSummariesForPrompt(
      allSummaries.filter(
        (s: any) => s.chatId === info.chatId || s.characterId === info.characterId,
      ),
      readCount,
    ).map((s: any) => ({
      id: s.id,
      content: s.content,
      createdAt: s.createdAt,
      coveredUntil: s.coveredUntil,
      isImportant: s.isImportant,
    }));

    // 重要事件記錄本以 chatId 為 key，舊資料用 characterId；事件在記錄本的 events 裡，跟聊天一樣依優先級取
    const eventsLog =
      (info.chatId ? await db.get<any>(DB_STORES.IMPORTANT_EVENTS, info.chatId) : undefined) ??
      (await db.get<any>(DB_STORES.IMPORTANT_EVENTS, info.characterId));
    context.importantEvents = eventsLog?.settings?.enabled
      ? [...(eventsLog.events ?? [])]
          .sort((a: any, b: any) => (a.priority || 3) - (b.priority || 3))
          .slice(0, eventsLog.settings.maxEvents ?? 50)
          .map((e: any) => ({
            id: e.id,
            content: e.content,
            category: e.category,
            priority: e.priority,
          }))
      : [];

    if (info.chatId) {
      // 包含普通聊天消息和通話記錄（sender === "system" 且含通話內容）
      const msgs = (await loadMessages(info.chatId))
        .filter((m: any) => {
          if (m.sender === "user" || m.sender === "assistant") return true;
          if (
            m.sender === "system" &&
            typeof m.content === "string" &&
            m.content.includes("📞 通話結束")
          ) {
            return true;
          }
          return false;
        })
        .slice(-RECENT_CHAT_LIMIT);
      context.recentChatHistory = msgs.map((m: any) => ({
        role: (m.is_user ? "user" : "assistant") as "user" | "assistant",
        name: m.name,
        content: m.content,
        createdAt: m.createdAt,
      }));
    }
  } catch (err) {
    console.warn("[通話] 載入總結、重要事件或聊天紀錄失敗", err);
  }

  return context;
}
