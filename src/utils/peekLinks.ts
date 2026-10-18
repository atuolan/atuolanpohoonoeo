/**
 * 偷看的結果回到聊天（純函式）：三個開關、記進記憶的句子、被發現時留在聊天裡的那筆
 */

/** 每個聊天各自的開關，預設都關（會不會被他發現不是開關，放下手機時擲骰決定） */
export interface PeekLinkSettings {
  /** 找到的秘密記成重要事件，之後聊天他會記得使用者知道了 */
  remember: boolean;
  /** 他跟使用者那串沒送出的草稿可以幫他按送出 */
  sendDraft: boolean;
}

export const DEFAULT_PEEK_LINKS: PeekLinkSettings = { remember: false, sendDraft: false };

export interface FoundSecret {
  key: string;
  label: string;
  detail: string;
}

const CAUGHT_LIMIT = 5;

export function peekSecretEventTag(key: string): string {
  return `peek:${key}`;
}

/** 記進重要事件的那句話 */
export function peekSecretEventContent(found: FoundSecret, userName: string, charName: string): string {
  const detail = found.detail ? `：${found.detail}` : "";
  return `${userName}偷看${charName}的手機，知道了「${found.label}」${detail}`;
}

/** 被他發現：留在聊天裡的系統訊息，他下一則回覆會看到 */
export function buildCaughtNote(found: FoundSecret[], userName: string, charName: string): string {
  const head = `${userName}剛剛偷看了${charName}的手機，被${charName}發現了。`;
  if (found.length === 0) return head;
  const lines = found.slice(0, CAUGHT_LIMIT).map((f) => `・${f.label}${f.detail ? `：${f.detail}` : ""}`);
  const more = found.length > CAUGHT_LIMIT ? `\n……還有 ${found.length - CAUGHT_LIMIT} 個` : "";
  return `${head}看到了：\n${lines.join("\n")}${more}`;
}

/** 起疑：沒被抓到，但他覺得手機被動過 */
export function buildSuspiciousNote(charName: string): string {
  return `${charName}拿起手機時覺得哪裡怪怪的，好像被人動過，但不確定是誰、看了什麼。`;
}

// ===== 隱匿檢定：放下手機時擲 d20，像跑團 =====

export type StealthOutcome = "safe" | "suspicious" | "caught";

export interface StealthCheck {
  /** 擲出的點數 1–20 */
  roll: number;
  /** 難度：擲到這個以上才沒被發現 */
  dc: number;
  outcome: StealthOutcome;
  /** 20 大成功、1 大失敗 */
  critical?: "success" | "fail";
}

const BASE_DC = 6;
const MAX_DC = 18;
/** 比難度少幾點以內算「起疑」 */
const SUSPICIOUS_MARGIN = 3;

/** 找到越多秘密、翻越多 App，越容易被發現 */
export function stealthDC(foundCount: number, appCount: number): number {
  return Math.min(MAX_DC, BASE_DC + foundCount * 2 + appCount);
}

export function rollStealth(foundCount: number, appCount: number, random: () => number = Math.random): StealthCheck {
  const dc = stealthDC(foundCount, appCount);
  const roll = Math.min(20, 1 + Math.floor(random() * 20));
  if (roll === 20) return { roll, dc, outcome: "safe", critical: "success" };
  if (roll === 1) return { roll, dc, outcome: "caught", critical: "fail" };
  if (roll >= dc) return { roll, dc, outcome: "safe" };
  if (roll >= dc - SUSPICIOUS_MARGIN) return { roll, dc, outcome: "suspicious" };
  return { roll, dc, outcome: "caught" };
}
