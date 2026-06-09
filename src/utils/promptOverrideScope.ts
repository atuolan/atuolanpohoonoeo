/**
 * 提示词覆盖 scope 計算
 *
 * 用於決定聊天專屬提示詞開關與聊天專屬提示詞條目的存儲鍵：
 * - 1v1 聊天：`char__${characterId}` （以角色卡為單位共享）
 * - 多人卡（單張卡的群聊形式）：`char__${characterId}` （與 1v1 共享同一作用域）
 * - 真正的群聊（多張卡合併）：`group__${chatId}` （該聊天獨立）
 *
 * NOTE: 變量（localVars）仍依 chatId 儲存於 Chat 記錄，這個 scope 僅用於
 * 提示詞開關覆蓋（promptToggles）與聊天專屬提示詞條目（chatPrompts）。
 */

import type { ChatLocalPrompt, PromptOverrideRecord } from "@/types/chat";

export interface PromptOverrideScopeInput {
  /** 聊天 ID（群聊作為作用域的依據） */
  id: string;
  /** 主控角色 ID（1v1 與多人卡作為作用域的依據） */
  characterId: string;
  /** 是否為群聊（含多人卡及真群聊兩種） */
  isGroupChat?: boolean;
  /** 群聊元數據，用於辨識多人卡 */
  groupMetadata?: { isMultiCharCard?: boolean } | null;
}

/**
 * 計算 prompt override 作用域鍵。
 */
export function getPromptOverrideScopeKey(chat: PromptOverrideScopeInput): string {
  const isGroup = !!chat.isGroupChat;
  const isMultiCharCard = !!chat.groupMetadata?.isMultiCharCard;

  // 真群聊：多張卡合併成一個聊天 → 該聊天獨立
  if (isGroup && !isMultiCharCard) {
    return `group__${chat.id}`;
  }

  // 1v1 或 多人卡（同一角色卡的多形態） → 以 characterId 為作用域
  return `char__${chat.characterId}`;
}

/**
 * 判斷 scope key 是否屬於群聊作用域
 */
export function isGroupScopeKey(scopeKey: string): boolean {
  return scopeKey.startsWith("group__");
}

/**
 * 判斷 scope key 是否屬於角色作用域
 */
export function isCharacterScopeKey(scopeKey: string): boolean {
  return scopeKey.startsWith("char__");
}

/**
 * 載入指定 scope 的 prompt override 資料（toggles + chatPrompts）。
 *
 * - 優先從 IDB `promptOverrides` store 讀取
 * - 若無記錄則回退到 chat record 的 legacy `chatVariables.{promptToggles, chatPrompts}` 欄位
 * - 出錯時回傳空結果，不影響主流程
 */
export async function loadPromptOverrideForChat(chat: {
  id: string;
  characterId: string;
  isGroupChat?: boolean;
  groupMetadata?: { isMultiCharCard?: boolean } | null;
  chatVariables?: {
    promptToggles?: Record<string, boolean>;
    chatPrompts?: ChatLocalPrompt[];
  } | null;
}): Promise<{
  chatPromptToggles?: Record<string, boolean>;
  chatLocalPrompts?: ChatLocalPrompt[];
}> {
  try {
    const scopeKey = getPromptOverrideScopeKey({
      id: chat.id,
      characterId: chat.characterId,
      isGroupChat: chat.isGroupChat,
      groupMetadata: chat.groupMetadata ?? null,
    });
    const { db, DB_STORES } = await import("@/db/database");
    const record = await db
      .get<PromptOverrideRecord>(DB_STORES.PROMPT_OVERRIDES, scopeKey)
      .catch(() => undefined);
    if (record) {
      return {
        chatPromptToggles: record.promptToggles,
        chatLocalPrompts: record.chatPrompts,
      };
    }
  } catch (err) {
    console.warn("[promptOverrideScope] loadPromptOverrideForChat failed:", err);
  }
  // 回退到 legacy 欄位
  return {
    chatPromptToggles: chat.chatVariables?.promptToggles,
    chatLocalPrompts: chat.chatVariables?.chatPrompts,
  };
}
