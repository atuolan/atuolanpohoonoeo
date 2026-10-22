import type { CharAway } from "@/types/chat";

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

export interface ParsedCharAway {
  minutes: number;
  reason: string;
  backText: string;
}

/** 是否正在暫時離開 */
export function isCharAwayActive(away: CharAway | undefined): boolean {
  return !!away && !away.endedAt;
}

/** 是否還在冷卻中（主動取消不算冷卻） */
export function isCharAwayCoolingDown(
  away: CharAway | undefined,
  now: number,
): boolean {
  return (
    !!away &&
    !!away.endedAt &&
    away.endedBy !== "cancel" &&
    now - away.endedAt < CHAR_AWAY_COOLDOWN_MS
  );
}

/** 現在能不能用暫時離開 */
export function canUseCharAway(
  chat: {
    charAway?: CharAway;
    charAwayEnabled?: boolean;
    isGroupChat?: boolean;
  },
  opts: { faceToFace: boolean; now: number },
): boolean {
  if (chat.charAwayEnabled === false) return false;
  if (chat.isGroupChat) return false;
  if (opts.faceToFace) return false;
  if (isCharAwayActive(chat.charAway)) return false;
  if (isCharAwayCoolingDown(chat.charAway, opts.now)) return false;
  return true;
}

/** 建立一次暫時離開 */
export function createCharAway(
  parsed: ParsedCharAway,
  now: number,
  startMessageId?: string,
): CharAway {
  return {
    id: `away_${now}`,
    reason: parsed.reason,
    backText: parsed.backText,
    startedAt: now,
    returnAt: now + parsed.minutes * 60000,
    startMessageId,
    urgeCount: 0,
    callCount: 0,
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

/** 記一通暫離期間未接的電話 */
export function recordAwayCall(away: CharAway, now: number): CharAway {
  return {
    ...away,
    callCount: away.callCount + 1,
    updatedAt: now,
  };
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

/** 回來後給 AI 的提示；不需要提示時回 null */
export function buildCharAwayReturnNote(
  away: CharAway | undefined,
  leftMessageCount: number,
): string | null {
  if (!away) return null;
  if (!away.endedAt) return null;
  if (!away.replyPending) return null;
  if (away.endedBy === "cancel") return null;

  const endedAt = away.endedAt;

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
  return `${charName}去忙了（${away.reason}），大約 ${formatClock(away.returnAt)} 回來`;
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
