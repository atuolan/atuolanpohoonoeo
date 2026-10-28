/**
 * 共感娃娃：送給角色、收下後娃娃和他的身體感覺相連並回到 user 手上。
 * user 對娃娃做的事先累積，送出時合成一行 <共感娃娃>…</共感娃娃>，只算一輪。
 */

export const EMPATHY_DOLL_ITEM_ID = "gift_empathy_doll";
export const EMPATHY_DOLL_NAME = "共感娃娃";

export interface DollZone {
  id: string;
  label: string;
  /** 親密部位：角色的娃娃開了親密互動才出現 */
  intimate?: boolean;
  /** 熱區（棉花娃娃 viewBox 0 0 240 340 的座標），一個部位可以有左右兩塊 */
  shapes: Array<{ x: number; y: number; w: number; h: number }>;
  /** 「顯示可以碰的地方」時名字排在娃娃哪一側、哪個高度，線拉到 (ax, ay) */
  callout: { side: "left" | "right"; y: number; ax: number; ay: number };
}

/** 後面的蓋在前面上；熱區對齊 CottonDoll.vue 的身體 */
export const DOLL_ZONES: DollZone[] = [
  { id: "head", label: "頭", shapes: [{ x: 62, y: 28, w: 116, h: 46 }], callout: { side: "left", y: 50, ax: 100, ay: 52 } },
  { id: "ear", label: "耳朵", shapes: [{ x: 10, y: 106, w: 38, h: 40 }, { x: 192, y: 106, w: 38, h: 40 }], callout: { side: "left", y: 104, ax: 24, ay: 120 } },
  { id: "earlobe", label: "耳垂", intimate: true, shapes: [{ x: 12, y: 132, w: 24, h: 20 }, { x: 204, y: 132, w: 24, h: 20 }], callout: { side: "left", y: 128, ax: 22, ay: 144 } },
  { id: "cheek", label: "臉頰", shapes: [{ x: 44, y: 142, w: 46, h: 34 }, { x: 150, y: 142, w: 46, h: 34 }], callout: { side: "left", y: 160, ax: 64, ay: 158 } },
  { id: "lips", label: "嘴唇", intimate: true, shapes: [{ x: 102, y: 148, w: 36, h: 26 }], callout: { side: "right", y: 146, ax: 128, ay: 160 } },
  { id: "neck", label: "脖子", intimate: true, shapes: [{ x: 94, y: 180, w: 52, h: 14 }], callout: { side: "left", y: 186, ax: 104, ay: 187 } },
  { id: "hand", label: "手", shapes: [{ x: 40, y: 202, w: 38, h: 58 }, { x: 162, y: 202, w: 38, h: 58 }], callout: { side: "left", y: 226, ax: 54, ay: 232 } },
  { id: "collarbone", label: "鎖骨", intimate: true, shapes: [{ x: 90, y: 194, w: 60, h: 12 }], callout: { side: "right", y: 170, ax: 140, ay: 200 } },
  { id: "chest", label: "胸口", intimate: true, shapes: [{ x: 84, y: 206, w: 72, h: 28 }], callout: { side: "right", y: 194, ax: 152, ay: 216 } },
  { id: "nipple", label: "乳頭", intimate: true, shapes: [{ x: 92, y: 210, w: 20, h: 20 }, { x: 128, y: 210, w: 20, h: 20 }], callout: { side: "right", y: 218, ax: 138, ay: 220 } },
  { id: "belly", label: "肚子", shapes: [{ x: 86, y: 234, w: 68, h: 28 }], callout: { side: "right", y: 242, ax: 146, ay: 244 } },
  { id: "navel", label: "肚臍", intimate: true, shapes: [{ x: 110, y: 244, w: 20, h: 20 }], callout: { side: "right", y: 266, ax: 120, ay: 254 } },
  { id: "waist", label: "腰", intimate: true, shapes: [{ x: 72, y: 236, w: 16, h: 34 }, { x: 152, y: 236, w: 16, h: 34 }], callout: { side: "left", y: 256, ax: 80, ay: 252 } },
  { id: "thigh", label: "大腿", intimate: true, shapes: [{ x: 90, y: 280, w: 28, h: 30 }, { x: 122, y: 280, w: 28, h: 30 }], callout: { side: "left", y: 288, ax: 100, ay: 296 } },
  { id: "innerThigh", label: "大腿內側", intimate: true, shapes: [{ x: 108, y: 284, w: 24, h: 26 }], callout: { side: "right", y: 314, ax: 122, ay: 298 } },
  { id: "groin", label: "下身", intimate: true, shapes: [{ x: 104, y: 262, w: 32, h: 22 }], callout: { side: "right", y: 290, ax: 128, ay: 274 } },
  { id: "foot", label: "腳", shapes: [{ x: 86, y: 304, w: 36, h: 24 }, { x: 118, y: 304, w: 36, h: 24 }], callout: { side: "left", y: 320, ax: 100, ay: 318 } },
];

/** 整隻抱住用的部位 id */
export const DOLL_WHOLE_ZONE = "whole";

export interface DollAction {
  id: string;
  label: string;
  /** 開了親密互動才出現 */
  intimate?: boolean;
}

export const DOLL_ACTIONS: DollAction[] = [
  { id: "poke", label: "戳" },
  { id: "stroke", label: "摸" },
  { id: "pinch", label: "捏" },
  { id: "kiss", label: "親" },
  { id: "lick", label: "舔" },
  { id: "bite", label: "咬" },
  { id: "blow", label: "吹氣" },
  { id: "tickle", label: "搔癢" },
  { id: "pat", label: "拍" },
  { id: "knead", label: "揉", intimate: true },
  { id: "suck", label: "吸", intimate: true },
];

export function actionsFor(intimate: boolean): DollAction[] {
  return DOLL_ACTIONS.filter((a) => intimate || !a.intimate);
}

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

export function zonesFor(intimate: boolean): DollZone[] {
  return DOLL_ZONES.filter((z) => intimate || !z.intimate);
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

/** 提示詞裡娃娃訊息後面的說明；lookNote 是換過造型時的「娃娃穿著…」 */
export function dollPromptNote(names: DollNames, round?: number, lookNote?: string): string {
  const again = round && round > 1 ? `；這是 30 分鐘內第 ${round} 次` : "";
  const look = lookNote ? `${lookNote}；` : "";
  return `（${look}${names.userName} 對共感娃娃做了這些，${names.charName} 的身體同時感覺得到${again}）`;
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
