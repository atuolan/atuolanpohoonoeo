import type { CharAway, CharAwayKind } from "@/types/chat";

/** 暫時離開最短分鐘數 */
export const CHAR_AWAY_MIN_MINUTES = 3;
/** 暫時離開最長分鐘數 */
export const CHAR_AWAY_MAX_MINUTES = 60;
/** 回來後多久內不能再暫離 */
export const CHAR_AWAY_COOLDOWN_MS = 60 * 60 * 1000;
/** 催回來失敗後要等多久才能再催 */
export const CHAR_AWAY_URGE_LOCK_MS = 5 * 60 * 1000;
/** reason 最長字數 */
export const CHAR_AWAY_REASON_MAX = 8;
/** back 最長字數 */
export const CHAR_AWAY_BACK_MAX = 30;

/** 睡覺最短時間 */
export const CHAR_SLEEP_MIN_MS = 3_600_000;
/** 睡覺最長時間 */
export const CHAR_SLEEP_MAX_MS = 12 * 3_600_000;
/** 幾點以後可以去睡（20:00 起） */
export const CHAR_SLEEP_NIGHT_START_HOUR = 20;
/** 幾點以後不能再去睡（到 05:59） */
export const CHAR_SLEEP_NIGHT_END_HOUR = 6;
/** 忙碌最短時間 */
export const CHAR_BUSY_MIN_MS = 30 * 60_000;
/** 忙碌最長時間 */
export const CHAR_BUSY_MAX_MS = 12 * 3_600_000;
/** start 落在過去這段時間內就當作現在開始 */
export const CHAR_BUSY_START_PAST_GRACE_MS = 60 * 60_000;
/** 幾分鐘內的電話算同一輪 */
export const CHAR_WAKE_CALL_WINDOW_MS = 10 * 60_000;
/** 幾通電話會把他吵醒 */
export const CHAR_WAKE_CALL_COUNT = 3;
/** 睡覺 back 空白的預設 */
export const CHAR_SLEEP_BACK_DEFAULT = "早安";
/** 忙碌 back 空白的預設 */
export const CHAR_BUSY_BACK_DEFAULT = "我忙完了";

/** 由標籤開始時，回來時間至少留這麼久 */
const CHAR_AWAY_PLAN_MIN_LEAD_MS = 60_000;

/** 解析後的 <char-busy>（時間原樣是 "HH:mm"，不在這裡換算） */
export interface ParsedCharBusy {
  start?: string;
  end: string;
  reason: string;
  backText: string;
}

/** 解析後的 <char-sleep>（wake 原樣是 "HH:mm"，不在這裡換算） */
export interface ParsedCharSleep {
  wake: string;
  backText: string;
}

export interface ParsedCharAway {
  minutes: number;
  reason: string;
  backText: string;
}

/** 這個狀態是哪一種；undefined 當作暫離（舊資料） */
export function awayKind(away: CharAway | undefined): CharAwayKind {
  return away?.kind ?? "away";
}

/** 把 "7:30"、"07:30" 換成 24 小時制的時與分；格式錯回 null */
export function parseClock(hhmm: string): { h: number; m: number } | null {
  const match = hhmm.trim().match(/^(\d{1,2}):(\d{1,2})$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return { h, m };
}

/** 某一天（dayOffset 天後）的那個時刻；本地時間 */
function clockOnDay(
  ts: number,
  h: number,
  m: number,
  dayOffset: number,
): number {
  const d = new Date(ts);
  d.setHours(h, m, 0, 0);
  if (dayOffset !== 0) d.setDate(d.getDate() + dayOffset);
  return d.getTime();
}

/** 嚴格晚於 after 的最近一個 HH:mm 時間戳（本地時間）；格式錯回 null */
export function nextClockAfter(hhmm: string, after: number): number | null {
  const parsed = parseClock(hhmm);
  if (!parsed) return null;
  const todayAt = clockOnDay(after, parsed.h, parsed.m, 0);
  if (todayAt > after) return todayAt;
  return clockOnDay(after, parsed.h, parsed.m, 1);
}

/** 是不是晚上時段（20:00～05:59） */
export function isNightTime(now: number): boolean {
  const hour = new Date(now).getHours();
  return hour >= CHAR_SLEEP_NIGHT_START_HOUR || hour < CHAR_SLEEP_NIGHT_END_HOUR;
}

/** 是否正在暫時離開 */
export function isCharAwayActive(away: CharAway | undefined): boolean {
  return !!away && !away.endedAt;
}

/** 是否還在冷卻中（主動取消不算冷卻）；只擋同一種，睡覺不冷卻 */
export function isCharAwayCoolingDown(
  away: CharAway | undefined,
  now: number,
  kind: CharAwayKind = "away",
): boolean {
  if (kind === "sleep") return false;
  if (awayKind(away) !== kind) return false;
  return (
    !!away &&
    !!away.endedAt &&
    away.endedBy !== "cancel" &&
    now - away.endedAt < CHAR_AWAY_COOLDOWN_MS
  );
}

/** 有沒有預約好在等（endedAt 有值＝已取消或已開始） */
export function isCharAwayPlanPending(plan: CharAway | undefined): boolean {
  return !!plan && !plan.endedAt;
}

/** 判斷能不能用時需要的聊天欄位 */
type AvailabilityChat = {
  charAway?: CharAway;
  charAwayPlan?: CharAway;
  charAwayEnabled?: boolean;
  charSleepEnabled?: boolean;
  charBusyEnabled?: boolean;
  isGroupChat?: boolean;
};

/** 現在能不能用暫時離開 */
export function canUseCharAway(
  chat: AvailabilityChat,
  opts: { faceToFace: boolean; now: number },
): boolean {
  if (chat.charAwayEnabled === false) return false;
  if (chat.isGroupChat) return false;
  if (opts.faceToFace) return false;
  if (isCharAwayActive(chat.charAway)) return false;
  if (isCharAwayCoolingDown(chat.charAway, opts.now, "away")) return false;
  return true;
}

/** 現在能不能去睡覺（只在晚上 20:00～05:59） */
export function canUseCharSleep(
  chat: AvailabilityChat,
  opts: { faceToFace: boolean; now: number },
): boolean {
  if (chat.charSleepEnabled === false) return false;
  if (chat.isGroupChat) return false;
  if (opts.faceToFace) return false;
  if (isCharAwayActive(chat.charAway)) return false;
  return isNightTime(opts.now);
}

/** 現在能不能排忙碌行程 */
export function canUseCharBusy(
  chat: AvailabilityChat,
  opts: { faceToFace: boolean; now: number },
): boolean {
  if (chat.charBusyEnabled === false) return false;
  if (chat.isGroupChat) return false;
  if (opts.faceToFace) return false;
  if (isCharAwayActive(chat.charAway)) return false;
  if (isCharAwayCoolingDown(chat.charAway, opts.now, "busy")) return false;
  return true;
}

/** 建立一次暫時離開；planStartAt 有預約時傳預約開始時間，回來時間晚於它就提前到它 */
export function createCharAway(
  parsed: ParsedCharAway,
  now: number,
  startMessageId?: string,
  planStartAt?: number,
): CharAway {
  let returnAt = now + parsed.minutes * 60000;
  if (planStartAt !== undefined && planStartAt > now && returnAt > planStartAt) {
    returnAt = Math.max(planStartAt, now + CHAR_AWAY_PLAN_MIN_LEAD_MS);
  }
  return {
    id: `away_${now}`,
    kind: "away",
    reason: parsed.reason,
    backText: parsed.backText,
    startedAt: now,
    returnAt,
    startMessageId,
    urgeCount: 0,
    callCount: 0,
    updatedAt: now,
  };
}

/** 建立一次睡覺；wake 格式錯回 null */
export function createCharSleep(
  parsed: ParsedCharSleep,
  now: number,
  startMessageId?: string,
  planStartAt?: number,
): CharAway | null {
  const wakeAt = nextClockAfter(parsed.wake, now);
  if (wakeAt === null) return null;

  let returnAt = Math.min(
    now + CHAR_SLEEP_MAX_MS,
    Math.max(now + CHAR_SLEEP_MIN_MS, wakeAt),
  );
  if (planStartAt !== undefined && planStartAt > now && returnAt > planStartAt) {
    returnAt = Math.max(planStartAt, now + CHAR_AWAY_PLAN_MIN_LEAD_MS);
  }

  return {
    id: `sleep_${now}`,
    kind: "sleep",
    reason: "睡覺",
    backText: parsed.backText || CHAR_SLEEP_BACK_DEFAULT,
    startedAt: now,
    returnAt,
    startMessageId,
    urgeCount: 0,
    callCount: 0,
    sneakCount: 0,
    callAts: [],
    updatedAt: now,
  };
}

/** 建立一次忙碌（startedAt > now 代表是預約）；end 格式錯回 null */
export function createCharBusy(
  parsed: ParsedCharBusy,
  now: number,
  startMessageId?: string,
): CharAway | null {
  if (!parseClock(parsed.end)) return null;

  let startedAt = now;
  if (parsed.start) {
    const startClock = parseClock(parsed.start);
    if (startClock) {
      const todayAt = clockOnDay(now, startClock.h, startClock.m, 0);
      const yesterdayAt = clockOnDay(now, startClock.h, startClock.m, -1);
      // 剛過去的時間就當作現在開始（跨午夜時也要看昨天那個時刻）
      const inPastGrace = [todayAt, yesterdayAt].some(
        (t) => t <= now && t > now - CHAR_BUSY_START_PAST_GRACE_MS,
      );
      if (!inPastGrace) {
        const next = nextClockAfter(parsed.start, now);
        if (next === null) return null;
        if (next > now + 24 * 3_600_000) return null;
        startedAt = next;
      }
    }
  }

  const endAt = nextClockAfter(parsed.end, startedAt);
  if (endAt === null) return null;
  const returnAt = Math.min(
    startedAt + CHAR_BUSY_MAX_MS,
    Math.max(startedAt + CHAR_BUSY_MIN_MS, endAt),
  );

  return {
    id: `busy_${startedAt}`,
    kind: "busy",
    reason: parsed.reason || "有事",
    backText: parsed.backText || CHAR_BUSY_BACK_DEFAULT,
    startedAt,
    returnAt,
    startMessageId,
    urgeCount: 0,
    callCount: 0,
    sneakCount: 0,
    updatedAt: now,
  };
}

/** 結束一次暫時離開，回傳新物件 */
export function endCharAway(
  away: CharAway,
  endedBy: "time" | "urge" | "cancel",
  now: number,
  hasLeftSomething: boolean,
): CharAway {
  return {
    ...away,
    endedAt: now,
    endedBy,
    replyPending:
      endedBy === "urge" ? true : endedBy === "time" ? hasLeftSomething : false,
    updatedAt: now,
  };
}

/** 記一次催回來的嘗試 */
export function recordUrgeAttempt(
  away: CharAway,
  won: boolean,
  now: number,
): CharAway {
  return {
    ...away,
    urgeCount: away.urgeCount + 1,
    urgeLockedUntil: won ? away.urgeLockedUntil : now + CHAR_AWAY_URGE_LOCK_MS,
    updatedAt: now,
  };
}

/** 記一通暫離期間未接的電話；睡覺另外記時間，用來算 10 分鐘內第幾通 */
export function recordAwayCall(away: CharAway, now: number): CharAway {
  const next: CharAway = {
    ...away,
    callCount: away.callCount + 1,
    updatedAt: now,
  };
  if (awayKind(away) === "sleep") {
    next.callAts = [
      ...(away.callAts ?? []).filter((t) => t >= now - CHAR_WAKE_CALL_WINDOW_MS),
      now,
    ];
  }
  return next;
}

/** 小遊戲贏了：記一次偷回，狀態不結束 */
export function recordSneakWin(away: CharAway, now: number): CharAway {
  return {
    ...away,
    urgeCount: away.urgeCount + 1,
    sneakCount: (away.sneakCount ?? 0) + 1,
    sneakPending: true,
    urgeLockedUntil: now + CHAR_AWAY_URGE_LOCK_MS,
    updatedAt: now,
  };
}

/** 偷回那一輪生成完了（ok 才記 lastSneakAt） */
export function finishSneak(
  away: CharAway,
  now: number,
  ok: boolean,
): CharAway {
  return {
    ...away,
    sneakPending: false,
    lastSneakAt: ok ? now : away.lastSneakAt,
    updatedAt: now,
  };
}

/** 真的起床／不忙了：結束狀態但不送 back */
export function wakeCharAway(away: CharAway, now: number): CharAway {
  return {
    ...away,
    endedAt: now,
    endedBy: "wake",
    replyPending: false,
    sneakPending: false,
    updatedAt: now,
  };
}

/** 這一通電話加上前面 10 分鐘內的，是不是第 3 通（會把他吵醒） */
export function shouldWakeByCall(
  away: CharAway | undefined,
  now: number,
): boolean {
  if (!away || !isCharAwayActive(away)) return false;
  if (awayKind(away) !== "sleep") return false;
  const recent = (away.callAts ?? []).filter(
    (t) => t >= now - CHAR_WAKE_CALL_WINDOW_MS,
  ).length;
  return recent + 1 >= CHAR_WAKE_CALL_COUNT;
}

/** 從上次偷回之後 user 留了幾則（entries 由呼叫端先筛成這段期間的） */
export function countLeftSinceSneak(
  away: CharAway,
  entries: { sentWhileAway?: string; isUser: boolean; at: number }[],
): number {
  const since = away.lastSneakAt ?? 0;
  return entries.filter((e) => e.isUser && e.at > since).length;
}

/** 回來後把 user 留的話回完了 */
export function clearReplyPending(away: CharAway, now: number): CharAway {
  return {
    ...away,
    replyPending: false,
    updatedAt: now,
  };
}

/** 本地時間 HH:mm */
export function formatClock(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** 給 AI 的暫時離開說明 */
export function buildCharAwayGuide(available: boolean): string {
  if (!available) return "";
  return `- 暫時離開：<char-away minutes="分鐘數" reason="在忙什麼" back="回來時說的第一句話"/>（真的忙到不能看手機時才用，例如開會、上課、洗澡、開車；很少用，平常聊天不要用。先在訊息裡跟 {{user}} 說一聲再放這個標籤。minutes 3～60；reason 8 字內；back 是時間到時系統替你送出的話，30 字內。離開期間看不到 {{user}} 的訊息，回來後再一起回）`;
}

/** 給 AI 的睡覺說明 */
export function buildCharSleepGuide(available: boolean): string {
  if (!available) return "";
  return `- 去睡覺：<char-sleep wake="起床時間 HH:mm" back="起床後的第一句話"/>（{{user}} 說晚安、或你自己睏了要睡時，依個性決定要不要真的去睡；想繼續陪 {{user}} 聊就不用放；{{user}} 情緒低落、在哭或有急事時，不要丟下他去睡。先在訊息裡道晚安再放這個標籤。wake 是 1～12 小時後的時間；back 30 字內，起床時系統替你送出。睡著後看不到 {{user}} 的訊息，起床後再一起回）`;
}

/** 給 AI 的忙碌說明；有預約時多一句提醒 */
export function buildCharBusyGuide(
  available: boolean,
  plan: CharAway | undefined,
  now: number,
): string {
  if (!available) return "";
  const lines = [
    `- 忙一段時間：<char-busy start="開始時間 HH:mm" end="結束時間 HH:mm" reason="在忙什麼" back="忙完的第一句話"/>（劇情裡要去做一件會忙上好一陣子、不方便看手機的事時用，例如搭飛機、搭火車、考試、值班；30 分鐘～12 小時，24 小時內開始的才排。現在就開始不用寫 start；reason 8 字內；back 30 字內，忙完時系統替你送出。不到一小時的小事用暫時離開）`,
  ];
  if (isCharAwayPlanPending(plan) && plan) {
    lines.push(
      `（你已經排了 ${planDayPrefix(plan.startedAt, now)}${formatClock(plan.startedAt)}～${formatClock(plan.returnAt)}「${plan.reason}」，再放一次會改掉原本的安排）`,
    );
  }
  return lines.join("\n");
}

/** 開始時間跟 now 不同天就寫「明天 」 */
function planDayPrefix(startedAt: number, now: number): string {
  const start = new Date(startedAt);
  const base = new Date(now);
  const sameDay =
    start.getFullYear() === base.getFullYear() &&
    start.getMonth() === base.getMonth() &&
    start.getDate() === base.getDate();
  return sameDay ? "" : "明天 ";
}

/** 有預約時給 AI 的提醒；不是待開始就回 null */
export function buildCharAwayPlanNote(
  plan: CharAway | undefined,
  now: number,
): string | null {
  if (!plan || !isCharAwayPlanPending(plan)) return null;
  return [
    "[接下來的行程]",
    `{{char}} ${planDayPrefix(plan.startedAt, now)}${formatClock(plan.startedAt)}～${formatClock(plan.returnAt)} 要「${plan.reason}」，那段時間沒辦法回訊息。時間快到時可以自然地跟 {{user}} 說一聲。`,
  ].join("\n");
}

/** 偷回那一輪給 AI 的提示；不在進行中或沒有 sneakPending 就回 null */
export function buildCharAwaySneakNote(
  away: CharAway | undefined,
  leftCount: number,
): string | null {
  if (!away || !isCharAwayActive(away)) return null;
  if (!away.sneakPending) return null;

  const kind = awayKind(away);
  const left = Math.max(0, leftCount);

  if (kind === "sleep") {
    return [
      "[被吵醒]",
      `{{char}} ${formatClock(away.startedAt)} 睡著了（預計 ${formatClock(away.returnAt)} 起床），現在被 {{user}} 吵醒（這是第 ${away.sneakCount ?? 0} 次）。迷迷糊糊依性格回一兩句${left > 0 ? `，回應 {{user}} 留的 ${left} 則訊息` : ""}，回完會繼續睡，不要說自己起床了。`,
      `如果 {{user}} 在哭、很難過或有急事，或依你的個性就是想起來陪他，可以在 </content> 之後放 <char-wake/> 真的起床，之後就正常聊天。`,
    ].join("\n");
  }

  if (kind === "busy") {
    return [
      "[偷偷回]",
      `{{char}} 正在「${away.reason}」（到 ${formatClock(away.returnAt)}），{{user}} 一直催，{{char}} 偷偷拿手機回一下。簡短回${left > 0 ? ` {{user}} 留的 ${left} 則訊息` : "一句"}，語氣像在偷用手機，回完還是在忙。`,
      `如果 {{user}} 有急事、很難過，而你正在做的事走得開，可以在 </content> 之後放 <char-wake/> 先不忙了；走不開（例如在飛機上）就不要放。`,
    ].join("\n");
  }

  return null;
}

/** 回來後給 AI 的提示；不需要提示時回 null */
export function buildCharAwayReturnNote(
  away: CharAway | undefined,
  leftMessageCount: number,
): string | null {
  if (!away) return null;
  if (!away.endedAt) return null;
  if (!away.replyPending) return null;
  if (away.endedBy === "cancel") return null;
  if (away.endedBy === "wake") return null;

  const endedAt = away.endedAt;
  const kind = awayKind(away);

  if (kind === "sleep") {
    if (away.endedBy !== "time") return null;
    const parts: string[] = [];
    if (leftMessageCount > 0) parts.push(`留了 ${leftMessageCount} 則訊息`);
    if (away.callCount > 0) {
      parts.push(`打了 ${away.callCount} 通電話給你（你在睡沒接）`);
    }
    if ((away.sneakCount ?? 0) > 0) {
      parts.push(`把你吵醒過 ${away.sneakCount} 次`);
    }

    const lines = [
      "[起床了]",
      `{{char}} ${formatClock(away.startedAt)} 去睡覺，${formatClock(endedAt)} 起床了，起床的第一句已經說了：「${away.backText}」`,
    ];
    if (parts.length > 0) {
      lines.push(`這段時間 {{user}} ${parts.join("、")}。`);
    }
    lines.push("現在接著回 {{user}} 留的話，不用再說一次自己起床了。");
    return lines.join("\n");
  }

  if (kind === "busy") {
    if (away.endedBy !== "time") return null;
    const parts: string[] = [];
    if (leftMessageCount > 0) parts.push(`留了 ${leftMessageCount} 則訊息`);
    if (away.callCount > 0) {
      parts.push(`打了 ${away.callCount} 通電話給你（你在忙沒接）`);
    }
    if ((away.sneakCount ?? 0) > 0) {
      parts.push(`讓你偷偷回過 ${away.sneakCount} 次`);
    }

    const lines = [
      "[忙完了]",
      `{{char}} 因為「${away.reason}」從 ${formatClock(away.startedAt)} 忙到 ${formatClock(endedAt)}，忙完的第一句已經說了：「${away.backText}」`,
    ];
    if (parts.length > 0) {
      lines.push(`這段時間 {{user}} ${parts.join("、")}。`);
    }
    lines.push("現在接著回 {{user}} 留的話，不用再說一次自己忙完了。");
    return lines.join("\n");
  }

  if (away.endedBy === "time") {
    const parts: string[] = [];
    if (leftMessageCount > 0) parts.push(`留了 ${leftMessageCount} 則訊息`);
    if (away.callCount > 0) {
      parts.push(`打了 ${away.callCount} 通電話給你（你在忙沒接）`);
    }
    if (away.urgeCount > 0) {
      parts.push(`按了 ${away.urgeCount} 次「快回來」想催你（沒催成功）`);
    }

    const lines = [
      "[剛忙完回來]",
      `{{char}} ${formatClock(away.startedAt)} 因為「${away.reason}」暫時離開，${formatClock(endedAt)} 回來了，回來的第一句已經說了：「${away.backText}」`,
    ];
    if (parts.length > 0) {
      lines.push(`這段時間 {{user}} ${parts.join("、")}。`);
    }
    lines.push("現在接著回 {{user}} 留的話，不用再說一次自己回來了。");
    return lines.join("\n");
  }

  if (away.endedBy === "urge") {
    const parts: string[] = [];
    if (away.callCount > 0) parts.push(`打了 ${away.callCount} 通電話`);
    if (away.urgeCount > 0) parts.push(`按了 ${away.urgeCount} 次「快回來」`);

    return [
      "[被催回來]",
      `{{char}} 本來因為「${away.reason}」要忙到 ${formatClock(away.returnAt)}，{{user}} 一直催（${parts.join("、")}），{{char}} ${formatClock(endedAt)} 提早回來了。`,
      leftMessageCount > 0
        ? `先用一兩句依性格自然反應被催回來，再回 {{user}} 留的 ${leftMessageCount} 則訊息。`
        : "用一兩句依性格自然反應被催回來。",
    ].join("\n");
  }

  return null;
}

/** 聊天室上方的情境提示 */
export function buildAwayHintText(charName: string, away: CharAway): string {
  const kind = awayKind(away);
  if (kind === "sleep") {
    return `${charName}睡著了，大約 ${formatClock(away.returnAt)} 起床`;
  }
  if (kind === "busy") {
    return `${charName}在忙（${away.reason}），大約 ${formatClock(away.returnAt)} 忙完`;
  }
  return `${charName}去忙了（${away.reason}），大約 ${formatClock(away.returnAt)} 回來`;
}

/** 「催他」小遊戲的按鈕文字 */
export function awayUrgeLabel(away: CharAway): string {
  const kind = awayKind(away);
  if (kind === "sleep") return "起床重睡";
  if (kind === "busy") return "偷偷回我";
  return "快回來";
}

/** 頂欄顯示的狀態文字 */
export function awayHeaderText(away: CharAway): string {
  if (awayKind(away) === "sleep") return "睡覺中";
  return `忙碌中・${away.reason}`;
}

/** 「快回來」小遊戲要點幾下 */
export function quickBackTapTarget(remainingMs: number): number {
  const minutes = Math.max(0, remainingMs) / 60000;
  const target = 15 + Math.round(minutes / 3);
  return Math.min(35, Math.max(15, target));
}

/** 這次玩哪個小遊戲 */
export function pickQuickBackGame(
  random: () => number = Math.random,
): "tap" | "rps" {
  return random() < 0.5 ? "tap" : "rps";
}
