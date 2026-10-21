/**
 * 改字被發現：用戶編輯自己發出的訊息時，角色有機率看到修改前的原文
 *
 * - 只有角色還沒回覆的訊息才擲骰子（還沒回＝可能正盯著螢幕）；已經回過的舊訊息安靜改掉
 * - 只改空白或標點不算改字，不擲骰子
 * - 原文保留第一次的版本；被發現過就一直算被發現，再改也不會洗掉
 */

export const DEFAULT_EDIT_NOTICE_CHANCE = 30;

export interface EditNoticeFields {
  role: string;
  content: string;
  isUserEdited?: boolean;
  editOriginalContent?: string;
  editNoticed?: boolean;
}

/** 去掉空白與標點後比較，只差這些就不算改字 */
function comparableText(text: string): string {
  return (text || "").normalize("NFKC").replace(/[\s\p{P}]/gu, "");
}

export function isMeaningfulEdit(before: string, after: string): boolean {
  return comparableText(before) !== comparableText(after);
}

/** 訊息之後還沒有任何角色回覆 */
export function isUnrepliedByChar(
  messages: ReadonlyArray<{ id: string; role: string }>,
  messageId: string,
): boolean {
  const index = messages.findIndex((m) => m.id === messageId);
  if (index < 0) return false;
  return !messages.slice(index + 1).some((m) => m.role === "ai");
}

export function clampEditNoticeChance(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : DEFAULT_EDIT_NOTICE_CHANCE;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/**
 * 在 message.content 換成新內容「之前」呼叫：記下原文、標記已編輯，必要時擲骰子
 * @param chance 0–100
 */
export function applyUserEdit(
  message: EditNoticeFields,
  newContent: string,
  options: { unreplied: boolean; chance: number; random?: () => number },
): void {
  if (message.role !== "user") return;
  if (!isMeaningfulEdit(message.content, newContent)) return;

  if (message.editOriginalContent === undefined) {
    message.editOriginalContent = message.content;
  }
  message.isUserEdited = true;

  if (message.editNoticed || !options.unreplied) return;
  const roll = (options.random ?? Math.random)() * 100;
  if (roll < clampEditNoticeChance(options.chance)) {
    message.editNoticed = true;
  }
}

/**
 * 給 AI 看的提示：接在被發現的那則訊息後面；改回原樣或沒被發現就回傳空字串
 * @param seer 看到原文的人（私聊是角色名，群聊是「群裡的人」）
 */
export function formatEditNoticeNote(
  message: { content: string; editNoticed?: boolean; editOriginalContent?: string },
  userName: string,
  seer: string,
): string {
  const original = message.editOriginalContent;
  if (!message.editNoticed || !original) return "";
  if (!isMeaningfulEdit(original, message.content)) return "";
  return `（${userName}送出後又改了這則訊息，${seer}看到了修改前的原文：「${original}」）`;
}
