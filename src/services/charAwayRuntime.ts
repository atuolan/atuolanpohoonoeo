/**
 * 角色暫時離開（<char-away>）的背景執行。
 *
 * 純函式（能不能用、怎麼建立、怎麼結束、給 AI 的提示）都在 charAway.ts；
 * 這裡只負責存取聊天記錄、排回來的計時器、原生通知與回來後的通知。
 * 原生通知、主動訊息、store 一律動態載入，避免循環引用。
 */
import { hasNativeNotifications } from "@/native/platform";
import {
  incrementLocalChatUnreadCount,
  loadAllChats,
  loadChatById,
  refreshChatDerivedMetadata,
  saveChatMetadata,
} from "@/storage/chatStorage";
import { appendMessages, loadMessages } from "@/storage/chatMessageStorage";
import {
  canUseCharAway,
  clearReplyPending,
  createCharAway,
  endCharAway,
  isCharAwayActive,
  recordAwayCall,
  recordUrgeAttempt,
} from "@/services/charAway";
import type { ParsedCharAway } from "@/services/charAway";
import type { CharAway, Chat, ChatMessage } from "@/types/chat";

export const CHAR_AWAY_CHANGED_EVENT = "aguaphone:char-away-changed";

/** 聊天頁開著哪個聊天（回來時如果正看著這個聊天就不吵） */
let viewingChatId: string | null = null;

/** 每個聊天排好的「回來」計時器 */
const returnTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** 正在處理回來的聊天，避免計時器與 visibilitychange 同時跑兩次 */
const returning = new Set<string>();

let runtimeStarted = false;

/** 提早一點點就算到（計時器會誤差幾百毫秒） */
const RETURN_GRACE_MS = 1500;

/** 聊天頁開關時同步，回來才知道使用者是不是正看著 */
export function setCharAwayViewingChat(chatId: string | null): void {
  viewingChatId = chatId;
}

/** 把暫離狀態寫進聊天記錄並通知畫面 */
export async function saveCharAway(
  chatId: string,
  away: CharAway,
): Promise<void> {
  const chat = await loadChatById(chatId);
  if (!chat) return;

  // 訊息另外存在 chatMessages 表，這裡只寫聊天本身的資料
  await saveChatMetadata({ ...chat, messages: [], charAway: away });

  try {
    window.dispatchEvent(
      new CustomEvent(CHAR_AWAY_CHANGED_EVENT, {
        detail: { chatId, charAway: away },
      }),
    );
  } catch {
    // 忽略（非瀏覽器環境 / 測試環境）
  }
}

/** 開始一次暫時離開；不能用時回 null */
export async function startCharAway(
  chatId: string,
  parsed: ParsedCharAway,
  startMessageId?: string,
): Promise<CharAway | null> {
  const chat = await loadChatById(chatId);
  if (!chat) return null;

  const now = Date.now();
  if (!canUseCharAway(chat, { faceToFace: false, now })) return null;

  const away = createCharAway(parsed, now, startMessageId);
  await saveCharAway(chatId, away);
  scheduleReturn(chatId, away);

  if (hasNativeNotifications()) {
    try {
      const name = await characterName(chat);
      const { scheduleNativeNotificationAt } = await import(
        "@/native/notifications"
      );
      await scheduleNativeNotificationAt({
        tag: `char-away-${chatId}`,
        at: away.returnAt,
        title: name,
        body: away.backText,
        extra: {
          type: "chat_message",
          chatId,
          characterId: chat.characterId,
        },
      });
    } catch (err) {
      console.warn("[CharAway] 排程原生通知失敗:", err);
    }
  }

  return away;
}

/** 主動取消（去哪裡、不想忙了）：不算冷卻 */
export async function cancelCharAway(chatId: string): Promise<void> {
  const chat = await loadChatById(chatId);
  const away = chat?.charAway;
  if (!chat || !away || !isCharAwayActive(away)) return;

  const next = endCharAway(away, "cancel", Date.now(), false);
  await saveCharAway(chatId, next);
  clearReturnTimer(chatId);
  await cancelScheduledNotification(chatId);
}

/** 玩「快回來」的結果；鎖住期間或不在一時離開中回 null */
export async function urgeCharAway(
  chatId: string,
  won: boolean,
): Promise<CharAway | null> {
  const chat = await loadChatById(chatId);
  const away = chat?.charAway;
  if (!away || !isCharAwayActive(away)) return null;

  const now = Date.now();
  if (away.urgeLockedUntil && away.urgeLockedUntil > now) return null;

  let next = recordUrgeAttempt(away, won, now);
  if (won) {
    next = endCharAway(next, "urge", now, true);
    clearReturnTimer(chatId);
    await cancelScheduledNotification(chatId);
  }
  await saveCharAway(chatId, next);
  return next;
}

/** 暫離期間 user 打了一通電話（沒接）：聊天裡留一則系統訊息並記次數 */
export async function recordCharAwayCall(
  chatId: string,
  characterName: string,
): Promise<void> {
  const chat = await loadChatById(chatId);
  const away = chat?.charAway;
  if (!away || !isCharAwayActive(away)) return;

  const now = Date.now();
  await appendToChat(chatId, [
    {
      id: `msg_away_call_${now}`,
      sender: "system",
      name: "system",
      content: `📞 你撥給${characterName}的電話沒有接通`,
      is_user: false,
      status: "sent",
      createdAt: now,
      updatedAt: now,
      isCallNotification: true,
      callNotificationType: "unanswered",
      sentWhileAway: away.id,
    },
  ]);
  await saveCharAway(chatId, recordAwayCall(away, now));
}

/** 回來後已經把 user 留的話回完了 */
export async function markCharAwayReplied(chatId: string): Promise<void> {
  const chat = await loadChatById(chatId);
  const away = chat?.charAway;
  if (!away || !away.replyPending) return;
  await saveCharAway(chatId, clearReplyPending(away, Date.now()));
}

/**
 * 時間到就回來：送回來的那句話、結束暫離、按情況發通知並補回覆留言。
 * @returns 這次有沒有真的執行回來
 */
export async function returnCharAwayIfDue(
  chatId: string,
  now = Date.now(),
): Promise<boolean> {
  if (returning.has(chatId)) return false;
  returning.add(chatId);

  try {
    const chat = await loadChatById(chatId);
    const away = chat?.charAway;
    if (!chat || !away || !isCharAwayActive(away)) return false;
    if (now < away.returnAt - RETURN_GRACE_MS) return false;

    const messages = await loadMessages(chatId);
    const lastTs = messages.reduce(
      (max, m) => Math.max(max, m.createdAt || 0),
      0,
    );
    const ts = Math.max(away.returnAt, lastTs + 1);
    const name = await characterName(chat);

    // 回來的第一句：以他的身分送進聊天
    await appendToChat(chatId, [
      {
        id: `msg_away_back_${ts}`,
        sender: "assistant",
        name,
        content: away.backText,
        is_user: false,
        status: "sent",
        createdAt: ts,
        updatedAt: ts,
      },
    ]);

    const hasLeft = messages.some((m) => m.sentWhileAway === away.id);
    const ended = endCharAway(away, "time", Date.now(), hasLeft);
    await saveCharAway(chatId, ended);
    clearReturnTimer(chatId);

    // App 在前景：排好的系統通知不需要了
    if (hasNativeNotifications()) {
      try {
        const { cancelNativeNotification, isAppInForeground } = await import(
          "@/native/notifications"
        );
        if (isAppInForeground()) {
          await cancelNativeNotification(`char-away-${chatId}`);
        }
      } catch (err) {
        console.warn("[CharAway] 取消排程通知失敗:", err);
      }
    }

    // 使用者不是正看著這個聊天：未讀 +1 並發通知
    if (viewingChatId !== chatId) {
      await incrementLocalChatUnreadCount(chatId, 1);

      try {
        const { pushNotificationService } = await import(
          "@/services/PushNotificationService"
        );
        const notificationItem = {
          id: `char-away-back-${chatId}-${ts}`,
          type: "chat_message" as const,
          title: name,
          message: away.backText,
          timestamp: Date.now(),
          createdAt: Date.now(),
          characterId: chat.characterId,
          characterName: name,
          chatId,
          priority: "normal" as const,
          read: false,
        };
        pushNotificationService.send(notificationItem);
      } catch (err) {
        console.warn("[CharAway] 發通知失敗:", err);
      }
    }

    // 有留話或未接來電：讓他接著回（聊天頁開著時聊天頁自己會處理）
    if (ended.replyPending && viewingChatId !== chatId) {
      try {
        const { proactiveMessageService } = await import(
          "@/services/ProactiveMessageService"
        );
        const ok = await proactiveMessageService.sendCharAwayReturnReply(chatId);
        if (ok) await markCharAwayReplied(chatId);
      } catch (err) {
        // 失敗就留著 replyPending，聊天頁打開時會補
        console.warn("[CharAway] 回來後回覆留言失敗:", err);
      }
    }

    return true;
  } finally {
    returning.delete(chatId);
  }
}

/** App 啟動時呼叫一次：補跑錯過的時間、重排計時器 */
export function startCharAwayRuntime(): void {
  if (runtimeStarted) return;
  runtimeStarted = true;

  void scanAll();

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void scanAll();
    });
  }
}

/** 全部聊天掃一次：時間到的補回來，還沒到的重排計時器 */
async function scanAll(): Promise<void> {
  try {
    const now = Date.now();
    const chats = await loadAllChats();
    for (const chat of chats) {
      if (chat.isGroupChat) continue;
      const away = chat.charAway;
      if (!away || !isCharAwayActive(away)) continue;

      if (now >= away.returnAt - RETURN_GRACE_MS) {
        await returnCharAwayIfDue(chat.id, now);
      } else {
        scheduleReturn(chat.id, away);
      }
    }
  } catch (err) {
    console.warn("[CharAway] 掃描暫離中的聊天失敗:", err);
  }
}

/** 排「時間到回來」的計時器（同一個聊天只留一個） */
function scheduleReturn(chatId: string, away: CharAway): void {
  clearReturnTimer(chatId);
  const delay = Math.max(0, away.returnAt - Date.now() - RETURN_GRACE_MS);
  const timer = setTimeout(() => {
    returnTimers.delete(chatId);
    void returnCharAwayIfDue(chatId);
  }, delay);
  returnTimers.set(chatId, timer);
}

function clearReturnTimer(chatId: string): void {
  const timer = returnTimers.get(chatId);
  if (timer === undefined) return;
  clearTimeout(timer);
  returnTimers.delete(chatId);
}

/** 取消排好的原生通知（網頁版沒有原生通知） */
async function cancelScheduledNotification(chatId: string): Promise<void> {
  if (!hasNativeNotifications()) return;
  try {
    const { cancelNativeNotification } = await import("@/native/notifications");
    await cancelNativeNotification(`char-away-${chatId}`);
  } catch (err) {
    console.warn("[CharAway] 取消原生通知失敗:", err);
  }
}

/** 角色名字：暱稱 > 角色名 > 聊天名稱 */
async function characterName(chat: Chat): Promise<string> {
  try {
    const { useCharactersStore } = await import("@/stores");
    const character = useCharactersStore().characters.find(
      (c) => c.id === chat.characterId,
    );
    const name = character?.nickname || character?.data?.name;
    if (name) return name;
  } catch {
    // store 還沒初始化（測試、背景啟動）
  }
  return chat.name;
}

/** 加訊息到聊天（同 PeekLinks）：寫入 → 更新聊天摘要 → 通知畫面 */
async function appendToChat(
  chatId: string,
  messages: ChatMessage[],
): Promise<void> {
  await appendMessages(chatId, messages);
  await refreshChatDerivedMetadata(chatId).catch(() => undefined);
  try {
    window.dispatchEvent(
      new CustomEvent("aguaphone:chat-messages-appended", { detail: { chatId } }),
    );
  } catch {
    // 非瀏覽器環境（測試）
  }
}
