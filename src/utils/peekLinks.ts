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

/** 被他發現：留在聊天裡的系統訊息；when：mid 偷看到一半被撞見，end 放下後才發現 */
export function buildCaughtNote(
  found: FoundSecret[],
  userName: string,
  charName: string,
  when: "mid" | "end" = "end",
): string {
  const head =
    when === "mid"
      ? `${userName}偷看${charName}的手機時被${charName}當場撞見，手機被拿回去了。`
      : `${userName}剛剛偷看了${charName}的手機，被${charName}發現了。`;
  if (found.length === 0) return head;
  const lines = found.slice(0, CAUGHT_LIMIT).map((f) => `・${f.label}${f.detail ? `：${f.detail}` : ""}`);
  const more = found.length > CAUGHT_LIMIT ? `\n……還有 ${found.length - CAUGHT_LIMIT} 個` : "";
  return `${head}看到了：\n${lines.join("\n")}${more}`;
}

/** 起疑：沒被抓到，但他覺得手機被動過 */
export function buildSuspiciousNote(charName: string): string {
  return `${charName}拿起手機時覺得哪裡怪怪的，好像被人動過，但不確定是誰、看了什麼。`;
}

// ===== 隱匿檢定：像跑團一樣擲骰 =====
// 放下手機時擲 d20 看他有沒有發現；偷看中每打開一個 App 擲 d100，擲到 3 以下他剛好回來

export type StealthOutcome = "safe" | "suspicious" | "caught";

export interface StealthCheck {
  /** 幾面骰：20 是放下手機時的檢定，100 是偷看中的突發事件 */
  sides: 20 | 100;
  /** 擲出的點數 */
  roll: number;
  /** d20：擲到這個以上才沒被發現；d100：擲到這個以下他就回來了 */
  dc: number;
  outcome: StealthOutcome;
  /** 20 大成功、1 大失敗 */
  critical?: "success" | "fail";
  /** 偷看到一半被他撞見 */
  interrupted?: boolean;
}

const BASE_DC = 5;
const MAX_DC = 18;
/** 比難度少幾點以內算「起疑」 */
const SUSPICIOUS_MARGIN = 3;
/** 偷看中每打開一個 App，d100 擲到這個以下他就回來了 */
export const INTERRUPT_CHANCE = 3;

/** 找到越多秘密越容易被發現（翻 App 的風險在偷看中的突發事件裡算） */
export function stealthDC(foundCount: number): number {
  return Math.min(MAX_DC, BASE_DC + foundCount * 2);
}

const rollDie = (sides: number, random: () => number) => Math.min(sides, 1 + Math.floor(random() * sides));

/** 放下手機時的隱匿檢定 */
export function rollStealth(foundCount: number, random: () => number = Math.random): StealthCheck {
  const dc = stealthDC(foundCount);
  const roll = rollDie(20, random);
  const base = { sides: 20 as const, roll, dc };
  if (roll === 20) return { ...base, outcome: "safe", critical: "success" };
  if (roll === 1) return { ...base, outcome: "caught", critical: "fail" };
  if (roll >= dc) return { ...base, outcome: "safe" };
  if (roll >= dc - SUSPICIOUS_MARGIN) return { ...base, outcome: "suspicious" };
  return { ...base, outcome: "caught" };
}

/** 偷看中打開一個 App：他剛好回來了就回傳結果，沒事回傳 null */
export function rollInterrupt(random: () => number = Math.random): StealthCheck | null {
  const roll = rollDie(100, random);
  if (roll > INTERRUPT_CHANCE) return null;
  return { sides: 100, roll, dc: INTERRUPT_CHANCE, outcome: "caught", interrupted: true };
}
