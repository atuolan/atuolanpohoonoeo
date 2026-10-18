/**
 * 偷看的結果回到聊天（純函式）：三個開關、記進記憶的句子、被發現時留在聊天裡的那筆
 */

/** 每個聊天各自的開關，預設都關 */
export interface PeekLinkSettings {
  /** 找到的秘密記成重要事件，之後聊天他會記得使用者知道了 */
  remember: boolean;
  /** 放下手機時在聊天裡留一筆「被他發現」，他下一則回覆會有反應 */
  caught: boolean;
  /** 他跟使用者那串沒送出的草稿可以幫他按送出 */
  sendDraft: boolean;
}

export const DEFAULT_PEEK_LINKS: PeekLinkSettings = { remember: false, caught: false, sendDraft: false };

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
