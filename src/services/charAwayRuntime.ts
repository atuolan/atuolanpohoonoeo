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
  awayKind,
  canUseCharAway,
  canUseCharBusy,
  canUseCharSleep,
  clearReplyPending,
  countLeftSinceSneak,
  createCharAway,
  createCharBusy,
  createCharSleep,
  endCharAway,
  fastForwardAway,
  fastForwardPlan,
  finishSneak,
  isCharAwayActive,
  isCharAwayPlanPending,
  pauseCharAway,
  resumeCharAway,
  recordAwayCall,
  recordSneakWin,
  recordUrgeAttempt,
  wakeCharAway,
} from "@/services/charAway";
import type {
  ParsedCharAway,
  ParsedCharBusy,
  ParsedCharSleep,
} from "@/services/charAway";
import type { CharAway, Chat, ChatMessage } from "@/types/chat";
import { computeChatNow, getChatClockShift } from "@/utils/fakeTime";

export const CHAR_AWAY_CHANGED_EVENT = "aguaphone:char-away-changed";

/** 聊天頁開著哪個聊天（回來時如果正看著這個聊天就不吵） */
let viewingChatId: string | null = null;

/** 每個聊天排好的「回來」計時器 */
const returnTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** 每個聊天排好的「預約開始」計時器 */
const planTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** 正在處理回來的聊天，避免計時器與 visibilitychange 同時跑兩次 */
const returning = new Set<string>();

/** 正在處理預約開始的聊天，避免計時器與 visibilitychange 同時跑兩次 */
const activatingPlans = new Set<string>();

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
        detail: { chatId, charAway: away, charAwayPlan: chat.charAwayPlan },
      }),
    );
  } catch {
    // 忽略（非瀏覽器環境 / 測試環境）
  }
}

/** 把預約寫進聊天記錄並通知畫面 */
export async function saveCharAwayPlan(
  chatId: string,
  plan: CharAway,
): Promise<void> {
  const chat = await loadChatById(chatId);
  if (!chat) return;

  // 訊息另外存在 chatMessages 表，這裡只寫聊天本身的資料
  await saveChatMetadata({ ...chat, messages: [], charAwayPlan: plan });

  try {
    window.dispatchEvent(
      new CustomEvent(CHAR_AWAY_CHANGED_EVENT, {
        detail: { chatId, charAway: chat.charAway, charAwayPlan: plan },
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

  const planStartAt = isCharAwayPlanPending(chat.charAwayPlan)
    ? chat.charAwayPlan!.startedAt
    : undefined;
  const away = createCharAway(parsed, now, startMessageId, planStartAt);
  await saveCharAway(chatId, away);
  scheduleReturn(chatId, away);
  await scheduleReturnNotification(chat, away);

  return away;
}

/** 開始一次睡覺；不能用或 wake 格式錯時回 null */
export async function startCharSleep(
  chatId: string,
  parsed: ParsedCharSleep,
  startMessageId?: string,
): Promise<CharAway | null> {
  const chat = await loadChatById(chatId);
  if (!chat) return null;

  const now = Date.now();
  const shiftMs = getChatClockShift(chat, now);
  if (!canUseCharSleep(chat, { faceToFace: false, now, shiftMs })) return null;

  const planStartAt = isCharAwayPlanPending(chat.charAwayPlan)
    ? chat.charAwayPlan!.startedAt
    : undefined;
  const away = createCharSleep(
    parsed,
    now,
    startMessageId,
    planStartAt,
    shiftMs,
  );
  if (!away) return null;
  await saveCharAway(chatId, away);
  scheduleReturn(chatId, away);
  await scheduleReturnNotification(chat, away);

  return away;
}

/** 開始一次忙碌；startedAt 在未來時放進預約（回傳 { plan }），否則直接開始（回傳 { active }） */
export async function startCharBusy(
  chatId: string,
  parsed: ParsedCharBusy,
  startMessageId?: string,
): Promise<{ active?: CharAway; plan?: CharAway } | null> {
  const chat = await loadChatById(chatId);
  if (!chat) return null;

  const now = Date.now();
  const shiftMs = getChatClockShift(chat, now);
  if (!canUseCharBusy(chat, { faceToFace: false, now, shiftMs })) return null;

  const away = createCharBusy(parsed, now, startMessageId, shiftMs);
  if (!away) return null;

  if (away.startedAt > now) {
    // 預約只能有一個：再排一次就蓋掉舊的
    if (isCharAwayPlanPending(chat.charAwayPlan)) {
      await cancelCharAwayPlan(chatId);
    }
    await saveCharAwayPlan(chatId, away);
    schedulePlanStart(chatId, away);
    // 回來的通知預約時就排好（App 關著也能準時收到結束的那句話）
    await scheduleReturnNotification(chat, away);
    return { plan: away };
  }

  await saveCharAway(chatId, away);
  scheduleReturn(chatId, away);
  await scheduleReturnNotification(chat, away);
  return { active: away };
}

/** 預約時間到：把 charAwayPlan 搬進 charAway 並排回來 */
export async function activatePlanIfDue(
  chatId: string,
  now = Date.now(),
): Promise<boolean> {
  if (activatingPlans.has(chatId)) return false;
  activatingPlans.add(chatId);

  try {
    const chat = await loadChatById(chatId);
    const plan = chat?.charAwayPlan;
    if (!chat || !plan || !isCharAwayPlanPending(plan)) return false;
    if (now < plan.startedAt - RETURN_GRACE_MS) return false;

    clearPlanTimer(chatId);

    // 還有進行中的狀態（撞到預約的暫離／睡覺）：時間到先送回來，還沒結束就取消
    if (isCharAwayActive(chat.charAway)) {
      await returnCharAwayIfDue(chatId, now);
      const refreshed = await loadChatById(chatId);
      const current = refreshed?.charAway;
      if (refreshed && current && isCharAwayActive(current)) {
        await saveCharAway(chatId, endCharAway(current, "cancel", now, false));
        clearReturnTimer(chatId);
        await cancelScheduledNotification(notificationTag(chatId, current));
      }
    }

    await saveCharAwayPlan(chatId, {
      ...plan,
      endedAt: now,
      endedBy: "time",
      updatedAt: now,
    });

    const { endedAt: _endedAt, endedBy: _endedBy, ...rest } = plan;
    const active: CharAway = {
      ...rest,
      fromPlan: true,
      updatedAt: now,
    };
    await saveCharAway(chatId, active);

    // 打開時連結束時間都過了：直接照結束處理（back 的時間戳是約好的結束時間）
    if (now >= active.returnAt - RETURN_GRACE_MS) {
      await returnCharAwayIfDue(chatId, now);
    } else {
      scheduleReturn(chatId, active);
    }

    return true;
  } finally {
    activatingPlans.delete(chatId);
  }
}

/**
 * 面對面開關後同步暫停狀態：面對面時暫停進行中的與預約（清計時器、取消通知），
 * 回線上後從剩下的時間繼續。重複呼叫不會重複暫停或恢復。
 */
export async function syncCharAwayF2F(
  chatId: string,
  faceToFace: boolean,
  now = Date.now(),
): Promise<void> {
  const chat = await loadChatById(chatId);
  if (!chat || chat.isGroupChat) return;
  const away = chat.charAway;
  const plan = chat.charAwayPlan;

  if (faceToFace) {
    if (away && !away.endedAt && !away.pausedAt) {
      await saveCharAway(chatId, pauseCharAway(away, now));
      clearReturnTimer(chatId);
      await cancelScheduledNotification(notificationTag(chatId, away));
    }
    if (plan && !plan.endedAt && !plan.pausedAt) {
      await saveCharAwayPlan(chatId, pauseCharAway(plan, now));
      clearPlanTimer(chatId);
      await cancelScheduledNotification(notificationTag(chatId, plan, true));
    }
    return;
  }

  if (away && !away.endedAt && away.pausedAt) {
    const resumed = resumeCharAway(away, now);
    await saveCharAway(chatId, resumed);
    if (now >= resumed.returnAt - RETURN_GRACE_MS) {
      await returnCharAwayIfDue(chatId, now);
    } else {
      scheduleReturn(chatId, resumed);
      await scheduleReturnNotification(chat, resumed);
    }
  }
  if (plan && !plan.endedAt && plan.pausedAt) {
    const resumed = resumeCharAway(plan, now);
    await saveCharAwayPlan(chatId, resumed);
    schedulePlanStart(chatId, resumed);
    await scheduleReturnNotification(chat, resumed);
  }
}

/**
 * 線上手動把劇情時間往後調（shiftBefore → shiftAfter）：
 * 跨過他回來的劇情時間就立刻回來；預約跨過開始就開始、連結束也跨過就一起結束。
 * 其他情況倒數不變。
 */
export async function fastForwardCharAway(
  chatId: string,
  shiftBefore: number,
  shiftAfter: number,
  now = Date.now(),
): Promise<void> {
  if (shiftAfter <= shiftBefore) return;
  const chat = await loadChatById(chatId);
  if (!chat || chat.isGroupChat) return;

  const away = chat.charAway;
  if (away && isCharAwayActive(away)) {
    const next = fastForwardAway(away, now, shiftBefore, shiftAfter);
    if (next) {
      await saveCharAway(chatId, next);
      await returnCharAwayIfDue(chatId, now);
    }
  }

  const plan = (await loadChatById(chatId))?.charAwayPlan;
  if (plan && isCharAwayPlanPending(plan)) {
    const next = fastForwardPlan(plan, now, shiftBefore, shiftAfter);
    if (next) {
      await saveCharAwayPlan(chatId, next);
      await activatePlanIfDue(chatId, now);
    }
  }
}

/** 取消還沒開始的預約 */
export async function cancelCharAwayPlan(chatId: string): Promise<void> {
  const chat = await loadChatById(chatId);
  const plan = chat?.charAwayPlan;
  if (!chat || !plan || !isCharAwayPlanPending(plan)) return;

  const now = Date.now();
  await saveCharAwayPlan(chatId, {
    ...plan,
    endedAt: now,
    endedBy: "cancel",
    updatedAt: now,
  });
  clearPlanTimer(chatId);
  await cancelScheduledNotification(notificationTag(chatId, plan, true));
}

/** 主動取消（去哪裡、不想忙了）：不算冷卻 */
export async function cancelCharAway(chatId: string): Promise<void> {
  const chat = await loadChatById(chatId);
  const away = chat?.charAway;
  if (!chat || !away || !isCharAwayActive(away)) return;

  const next = endCharAway(away, "cancel", Date.now(), false);
  await saveCharAway(chatId, next);
  clearReturnTimer(chatId);
  await cancelScheduledNotification(notificationTag(chatId, away));
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

  const kind = awayKind(away);
  if (kind === "sleep" || kind === "busy") {
    // 睡覺／忙碌：贏了只是偷回一則，不結束
    const next = won
      ? recordSneakWin(away, now)
      : recordUrgeAttempt(away, false, now);
    await saveCharAway(chatId, next);
    return next;
  }

  let next = recordUrgeAttempt(away, won, now);
  if (won) {
    next = endCharAway(next, "urge", now, true);
    clearReturnTimer(chatId);
    await cancelScheduledNotification(notificationTag(chatId, away));
  }
  await saveCharAway(chatId, next);
  return next;
}

/** 偷回那一輪生成完了 */
export async function finishCharAwaySneak(
  chatId: string,
  ok: boolean,
): Promise<CharAway | null> {
  const chat = await loadChatById(chatId);
  const away = chat?.charAway;
  if (!chat || !away || !isCharAwayActive(away) || !away.sneakPending) {
    return null;
  }

  const next = finishSneak(away, Date.now(), ok);
  await saveCharAway(chatId, next);
  return next;
}

/** 真的起床／不忙了：結束、清計時器、取消通知，不送 back */
export async function wakeCharAwayNow(
  chatId: string,
): Promise<CharAway | null> {
  const chat = await loadChatById(chatId);
  const away = chat?.charAway;
  if (!chat || !away || !isCharAwayActive(away)) return null;

  const next = wakeCharAway(away, Date.now());
  await saveCharAway(chatId, next);
  clearReturnTimer(chatId);
  await cancelScheduledNotification(notificationTag(chatId, away));
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
  ], chat);
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

    // 先存「已回來」再加訊息：聊天頁收到新訊息會重新讀聊天，要讀到回來後的狀態
    const leftEntries = messages
      .filter((m) => m.sentWhileAway === away.id)
      .map((m) => ({
        sentWhileAway: m.sentWhileAway,
        // 未接通卡片也算留下的東西
        isUser: m.is_user || m.sender === "system",
        at: m.createdAt,
      }));
    const hasLeft =
      countLeftSinceSneak(away, leftEntries) > 0 || away.callCount > 0;
    const ended = endCharAway(away, "time", Date.now(), hasLeft);
    await saveCharAway(chatId, ended);
    clearReturnTimer(chatId);

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
    ], chat);


    // App 在前景：排好的系統通知不需要了
    if (hasNativeNotifications()) {
      try {
        const { cancelNativeNotification, isAppInForeground } = await import(
          "@/native/notifications"
        );
        if (isAppInForeground()) {
          await cancelNativeNotification(notificationTag(chatId, away));
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
    // 睡覺／忙碌不呼叫背景回覆，replyPending 留著等使用者打開聊天時生成
    if (
      ended.replyPending &&
      viewingChatId !== chatId &&
      awayKind(away) === "away"
    ) {
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

/** 聊天的面對面狀態跟暫停狀態對不上（舊資料、在別處切換）時要同步 */
function needsF2FSync(chat: Chat): boolean {
  const f2f = chat.faceToFaceMode === true;
  const items = [chat.charAway, chat.charAwayPlan].filter(
    (a): a is CharAway => !!a && !a.endedAt,
  );
  return items.some((a) => (f2f ? !a.pausedAt : !!a.pausedAt));
}

/** 全部聊天掃一次：時間到的補回來，還沒到的重排計時器 */
async function scanAll(): Promise<void> {
  try {
    const now = Date.now();
    const chats = await loadAllChats();
    for (const listed of chats) {
      // 歸檔的聊天完全安靜（例如別台裝置同步過來的歸檔）
      if (listed.isGroupChat || listed.archivedAt) continue;
      let chat = listed;
      if (needsF2FSync(listed)) {
        await syncCharAwayF2F(listed.id, listed.faceToFaceMode === true, now);
        chat = (await loadChatById(listed.id)) ?? listed;
      }

      const away = chat.charAway;
      if (away && isCharAwayActive(away)) {
        if (now >= away.returnAt - RETURN_GRACE_MS) {
          await returnCharAwayIfDue(chat.id, now);
        } else {
          scheduleReturn(chat.id, away);
        }
      }

      const plan = chat.charAwayPlan;
      if (plan && isCharAwayPlanPending(plan)) {
        if (now >= plan.startedAt - RETURN_GRACE_MS) {
          await activatePlanIfDue(chat.id, now);
        } else {
          schedulePlanStart(chat.id, plan);
        }
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

/** 排「預約開始」的計時器（同一個聊天只留一個） */
function schedulePlanStart(chatId: string, plan: CharAway): void {
  clearPlanTimer(chatId);
  const delay = Math.max(0, plan.startedAt - Date.now() - RETURN_GRACE_MS);
  const timer = setTimeout(() => {
    planTimers.delete(chatId);
    void activatePlanIfDue(chatId);
  }, delay);
  planTimers.set(chatId, timer);
}

function clearPlanTimer(chatId: string): void {
  const timer = planTimers.get(chatId);
  if (timer === undefined) return;
  clearTimeout(timer);
  planTimers.delete(chatId);
}

/** 原生通知的 tag：預約與由預約開始的用另一組，避免蓋掉進行中的 */
function notificationTag(
  chatId: string,
  away: CharAway,
  isPlan = false,
): string {
  return isPlan || away.fromPlan || away.startedAt > Date.now()
    ? `char-away-plan-${chatId}`
    : `char-away-${chatId}`;
}

/** 排「時間到回來」的原生通知（內容是回來的第一句） */
async function scheduleReturnNotification(
  chat: Chat,
  away: CharAway,
): Promise<void> {
  if (!hasNativeNotifications()) return;
  try {
    const name = await characterName(chat);
    const { scheduleNativeNotificationAt } = await import(
      "@/native/notifications"
    );
    await scheduleNativeNotificationAt({
      tag: notificationTag(chat.id, away),
      at: away.returnAt,
      title: name,
      body: away.backText,
      extra: {
        type: "chat_message",
        chatId: chat.id,
        characterId: chat.characterId,
      },
    });
  } catch (err) {
    console.warn("[CharAway] 排程原生通知失敗:", err);
  }
}

/** 取消排好的原生通知（網頁版沒有原生通知） */
async function cancelScheduledNotification(tag: string): Promise<void> {
  if (!hasNativeNotifications()) return;
  try {
    const { cancelNativeNotification } = await import("@/native/notifications");
    await cancelNativeNotification(tag);
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

/** 加訊息到聊天（同 PeekLinks）：記劇情時間 → 寫入 → 更新聊天摘要 → 通知畫面 */
async function appendToChat(
  chatId: string,
  messages: ChatMessage[],
  chat: Chat,
): Promise<void> {
  for (const m of messages) {
    if (typeof m.storyTime !== "number") {
      m.storyTime = computeChatNow(chat, new Date(m.createdAt)).getTime();
    }
  }
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
