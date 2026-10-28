/**
 * 共感娃娃：送給角色、收下後娃娃和他的身體感覺相連並回到 user 手上。
 * user 對娃娃做的事先累積，送出時合成一行 <共感娃娃>…</共感娃娃>，只算一輪。
 */

export const EMPATHY_DOLL_ITEM_ID = "gift_empathy_doll";
export const EMPATHY_DOLL_NAME = "共感娃娃";

export type DollSide = "front" | "back";

export interface DollZone {
  id: string;
  label: string;
  side: DollSide;
  /** 親密部位：角色的娃娃開了親密互動才出現 */
  intimate?: boolean;
}

export const DOLL_ZONES: DollZone[] = [
  { id: "head", label: "頭", side: "front" },
  { id: "ear", label: "耳朵", side: "front" },
  { id: "cheek", label: "臉頰", side: "front" },
  { id: "lips", label: "嘴唇", side: "front", intimate: true },
  { id: "neck", label: "脖子", side: "front", intimate: true },
  { id: "hand", label: "手", side: "front" },
  { id: "chest", label: "胸口", side: "front", intimate: true },
  { id: "belly", label: "肚子", side: "front" },
  { id: "waist", label: "腰", side: "front", intimate: true },
  { id: "thigh", label: "大腿", side: "front", intimate: true },
  { id: "groin", label: "下身", side: "front", intimate: true },
  { id: "back", label: "背", side: "back" },
  { id: "butt", label: "臀部", side: "back", intimate: true },
];

/** 整隻抱住用的部位 id */
export const DOLL_WHOLE_ZONE = "whole";

export interface DollAction {
  id: string;
  label: string;
}

export const DOLL_ACTIONS: DollAction[] = [
  { id: "poke", label: "戳" },
  { id: "stroke", label: "摸" },
  { id: "pinch", label: "捏" },
  { id: "kiss", label: "親" },
  { id: "lick", label: "舔" },
  { id: "bite", label: "咬" },
  { id: "blow", label: "吹氣" },
];

export const DOLL_HUG_ACTION = "hug";

export type DollStrength = "light" | "medium" | "strong";

/** 按住多久算一次「按住」（以下是點一下） */
export const DOLL_HOLD_MIN_MS = 800;
export const DOLL_STRONG_MS = 2500;

export function strengthOf(holdMs: number): DollStrength {
  if (holdMs >= DOLL_STRONG_MS) return "strong";
  if (holdMs >= DOLL_HOLD_MIN_MS) return "medium";
  return "light";
}

const STRENGTH_RANK: Record<DollStrength, number> = { light: 0, medium: 1, strong: 2 };
const STRENGTH_LABEL: Record<DollStrength, string> = { light: "輕", medium: "中", strong: "重" };

export interface DollTouch {
  action: string;
  zone: string;
  count: number;
  /** 按住的總時間（點一下不算） */
  holdMs: number;
  strength: DollStrength;
}

export function zonesFor(intimate: boolean, side?: DollSide): DollZone[] {
  return DOLL_ZONES.filter((z) => (intimate || !z.intimate) && (!side || z.side === side));
}

/** 加一次碰觸：同動作同部位合併，次數加一、按住時間累加、強度取最強 */
export function addDollTouch(
  touches: DollTouch[],
  input: { action: string; zone: string; holdMs: number },
): DollTouch[] {
  const holdMs = input.holdMs >= DOLL_HOLD_MIN_MS ? input.holdMs : 0;
  const strength = strengthOf(input.holdMs);
  const index = touches.findIndex((t) => t.action === input.action && t.zone === input.zone);
  if (index === -1) {
    return [...touches, { action: input.action, zone: input.zone, count: 1, holdMs, strength }];
  }
  const prev = touches[index];
  const next: DollTouch = {
    ...prev,
    count: prev.count + 1,
    holdMs: prev.holdMs + holdMs,
    strength: STRENGTH_RANK[strength] > STRENGTH_RANK[prev.strength] ? strength : prev.strength,
  };
  return touches.map((t, i) => (i === index ? next : t));
}

function zoneLabel(id: string): string {
  if (id === DOLL_WHOLE_ZONE) return "娃娃";
  return DOLL_ZONES.find((z) => z.id === id)?.label ?? id;
}

function actionLabel(id: string): string {
  if (id === DOLL_HUG_ACTION) return "抱住";
  return DOLL_ACTIONS.find((a) => a.id === id)?.label ?? id;
}

/** 一筆碰觸寫成「捏臉頰 ×2」「摸腰 6 秒（重）」「抱住娃娃 4 秒（中）」 */
export function describeDollTouch(touch: DollTouch): string {
  const parts = [`${actionLabel(touch.action)}${zoneLabel(touch.zone)}`];
  if (touch.count > 1) parts.push(`×${touch.count}`);
  const seconds = Math.round(touch.holdMs / 1000);
  if (seconds >= 1) parts.push(`${seconds} 秒`);
  let text = parts.join(" ");
  if (touch.strength !== "light") text += `（${STRENGTH_LABEL[touch.strength]}）`;
  return text;
}

export function describeDollTouches(touches: DollTouch[]): string {
  return touches.map(describeDollTouch).join("、");
}

export const DOLL_TAG_RE = /<共感娃娃>([\s\S]*?)<\/共感娃娃>/i;

export function formatDollTag(text: string): string {
  return `<共感娃娃>${text}</共感娃娃>`;
}

/** 30 分鐘內的第幾次（含這次） */
export const DOLL_ROUND_WINDOW_MS = 30 * 60_000;

export function dollRoundOf(
  messages: Array<{ isDollTouch?: boolean; timestamp?: number }>,
  now: number,
): number {
  return (
    messages.filter((m) => m.isDollTouch && typeof m.timestamp === "number" && now - m.timestamp <= DOLL_ROUND_WINDOW_MS)
      .length + 1
  );
}

interface DollNames {
  userName: string;
  charName: string;
}

/** 提示詞裡娃娃訊息後面的說明 */
export function dollPromptNote(names: DollNames, round?: number): string {
  const again = round && round > 1 ? `；這是 30 分鐘內第 ${round} 次` : "";
  return `（${names.userName} 對共感娃娃做了這些，${names.charName} 的身體同時感覺得到${again}）`;
}

/** 送禮那則訊息後面說明這是什麼 */
export function empathyDollGiftNote(names: DollNames): string {
  return `（共感娃娃：收下後娃娃會和 ${names.charName} 的身體感覺相連，然後回到 ${names.userName} 手上；之後 ${names.userName} 對娃娃做的事，${names.charName} 都感覺得到）`;
}

// ===== 還沒送出的碰觸（每個聊天各自存在 localStorage） =====

function pendingKey(chatId: string): string {
  return `aguaphone-doll-pending-${chatId}`;
}

export function loadPendingDollTouches(chatId: string): DollTouch[] {
  try {
    const raw = localStorage.getItem(pendingKey(chatId));
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list)
      ? list.filter((t) => t && typeof t.action === "string" && typeof t.zone === "string" && t.count > 0)
      : [];
  } catch {
    return [];
  }
}

export function savePendingDollTouches(chatId: string, touches: DollTouch[]): void {
  try {
    if (touches.length) localStorage.setItem(pendingKey(chatId), JSON.stringify(touches));
    else localStorage.removeItem(pendingKey(chatId));
  } catch {
    // 私密模式等存不了就算了，只留在記憶體
  }
}
