/**
 * 通話開始時載入的上下文：對話總結、重要事件、通話前的聊天紀錄。
 * 語音、視訊、從快照恢復都走這裡，AI 在各種通話裡讀到的東西才會一致。
 */
import { db, DB_STORES } from "@/db/database";
import { buildEventScanText, selectImportantEventsForPrompt } from "@/utils/importantEventSelection";
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

/**
 * 通話前帶進來的聊天紀錄範圍。
 * 聊天一則回覆常拆成好幾個泡泡，只帶固定 15 則時，往往只剩最後一兩輪，
 * 剛約好要做的事（例如要一起玩哪款遊戲）會被切掉，電話裡就接不上。
 * 改成：至少帶最近 RECENT_CHAT_MIN 則，再往前補到字數預算或 RECENT_CHAT_MAX 則為止。
 */
export const RECENT_CHAT_MIN = 15;
export const RECENT_CHAT_MAX = 80;
export const RECENT_CHAT_CHAR_BUDGET = 8000;

/** 從最新往回挑通話前的聊天紀錄：保底 min 則，之後在字數預算和上限內盡量多帶 */
export function pickRecentChatForCall<T extends { content?: unknown }>(
  msgs: T[],
  opts: { min?: number; max?: number; charBudget?: number } = {},
): T[] {
  const min = opts.min ?? RECENT_CHAT_MIN;
  const max = opts.max ?? RECENT_CHAT_MAX;
  const budget = opts.charBudget ?? RECENT_CHAT_CHAR_BUDGET;
  let used = 0;
  let start = msgs.length;
  for (let i = msgs.length - 1; i >= 0; i--) {
    const taken = msgs.length - i;
    if (taken > max) break;
    const len = typeof msgs[i].content === "string" ? (msgs[i].content as string).length : 0;
    if (taken > min && used + len > budget) break;
    used += len;
    start = i;
  }
  return msgs.slice(start);
}

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

    // 重要事件記錄本以 chatId 為 key，舊資料用 characterId；事件在記錄本的 events 裡，挑法跟聊天一樣
    const eventsLog =
      (info.chatId ? await db.get<any>(DB_STORES.IMPORTANT_EVENTS, info.chatId) : undefined) ??
      (await db.get<any>(DB_STORES.IMPORTANT_EVENTS, info.characterId));

    if (info.chatId) {
      // 包含普通聊天消息和通話記錄（sender === "system" 且含通話內容）
      const all = (await loadMessages(info.chatId))
        .filter((m: any) => {
          if (m.isGroupChatHistory) return false;
          if (m.sender === "user" || m.sender === "assistant") return true;
          if (
            m.sender === "system" &&
            typeof m.content === "string" &&
            m.content.includes("📞 通話結束")
          ) {
            return true;
          }
          return false;
        });
      const msgs = pickRecentChatForCall(all);
      context.recentChatHistory = msgs.map((m: any) => ({
        role: (m.is_user ? "user" : "assistant") as "user" | "assistant",
        name: m.name,
        content: m.content,
        createdAt: m.createdAt,
      }));
    }

    // 常駐的每次都帶；其他看通話前最近聊到什麼
    context.importantEvents = eventsLog?.settings?.enabled
      ? selectImportantEventsForPrompt<any>(eventsLog.events ?? [], {
          mode: eventsLog.settings.injectMode,
          limit: eventsLog.settings.maxEvents ?? 50,
          scanText: buildEventScanText(context.recentChatHistory),
        }).map((e: any) => ({
          id: e.id,
          content: e.content,
          category: e.category,
          priority: e.priority,
        }))
      : [];
  } catch (err) {
    console.warn("[通話] 載入總結、重要事件或聊天紀錄失敗", err);
  }

  return context;
}
