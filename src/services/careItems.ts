/**
 * 照顧他的道具（咖啡、鬧鐘、早餐、香氛…）：什麼時候能用、用了之後他的狀態怎麼變。
 *
 * 忙碌、睡覺時用：跟「快回來」小遊戲贏了一樣，他馬上回一則（sneakReason = "item"），
 * 依道具擲骰決定回完是不是就忙完／起床。晚上醒著用（香氛）：只多給 AI 一段說明。
 */
import type { CareUse, ShopItem } from "@/data/shopItems";
import type { CharAway } from "@/types/chat";
import {
  awayKind,
  isCharAwayActive,
  isEasyWakeSleep,
  isNightTime,
} from "@/services/charAway";

export type CareItemStatus = { ok: true } | { ok: false; reason: string };

export interface CareItemContext {
  away?: CharAway | null;
  now: number;
  /** 劇情時間減現實時間 */
  shiftMs?: number;
  faceToFace: boolean;
  isGroupChat: boolean;
  /** 這個聊天有沒有開睡覺功能 */
  sleepEnabled?: boolean;
}

/** 現在能不能用這個道具；不能用時附上原因（顯示在道具旁邊） */
export function careItemStatus(use: CareUse, ctx: CareItemContext): CareItemStatus {
  if (ctx.isGroupChat) return { ok: false, reason: "群聊裡不能用" };
  if (ctx.faceToFace) return { ok: false, reason: "面對面時不能用" };

  const away = ctx.away ?? undefined;
  const active = isCharAwayActive(away);
  const kind = active ? awayKind(away) : null;
  const shift = ctx.shiftMs ?? 0;

  if (active && away?.sneakPending) return { ok: false, reason: "他正在回你" };

  switch (use.timing) {
    case "busy":
      return kind === "busy" ? { ok: true } : { ok: false, reason: "他在忙的時候才能用" };
    case "sleep":
      return kind === "sleep" ? { ok: true } : { ok: false, reason: "他在睡的時候才能用" };
    case "sleepMorning":
      if (kind !== "sleep") return { ok: false, reason: "天亮後他還在睡才能用" };
      return isEasyWakeSleep(away, ctx.now, shift)
        ? { ok: true }
        : { ok: false, reason: "天還沒亮（06:00 以後才能用）" };
    case "nightAwake":
      if (active) return { ok: false, reason: kind === "sleep" ? "他已經睡了" : "他現在在忙" };
      if (ctx.sleepEnabled === false) return { ok: false, reason: "這個聊天沒有開睡覺功能" };
      return isNightTime(ctx.now + shift)
        ? { ok: true }
        : { ok: false, reason: "晚上 8 點以後才能用" };
  }
}

/** 用在忙碌／睡覺上：他馬上回一則，擲骰決定回完是不是就忙完／起床 */
export function applyCareItemToAway(
  away: CharAway,
  item: ShopItem,
  now: number,
  shiftMs = 0,
  random: () => number = Math.random,
): CharAway {
  const use = item.careUse;
  // 天亮前的睡覺只會被吵醒一下
  const nightSleep =
    awayKind(away) === "sleep" && !isEasyWakeSleep(away, now, shiftMs);
  const chance = nightSleep ? 0 : use?.endChance ?? 0;
  return {
    ...away,
    sneakCount: (away.sneakCount ?? 0) + 1,
    sneakPending: true,
    sneakReason: "item",
    careItemId: item.id,
    earlyEndPending: chance > 0 && random() < chance,
    peekAt: undefined,
    peekLeftCount: 0,
    updatedAt: now,
  };
}

/** 聊天裡顯示的那一行 */
export function careItemNotice(item: ShopItem, characterName: string): string {
  const text = item.careUse?.notice ?? `你幫{{char}}用了${item.name}`;
  return text.replace(/\{\{char\}\}/g, characterName || "他");
}

/** 晚上醒著用道具（香氛）給 AI 的說明 */
export function buildCareItemNote(item: ShopItem): string {
  return [`[${item.name}]`, item.careUse?.note ?? ""].join("\n");
}
