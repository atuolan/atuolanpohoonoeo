/**
 * 偷看的結果回到聊天：開關存在 settings 表 peek-links-${chatId}（自動進備份和同步），
 * 秘密寫進重要事件、被發現的那筆和幫他送出的草稿直接加進聊天記錄
 */
import { db, DB_STORES } from "@/db/database";
import { appendMessages } from "@/storage/chatMessageStorage";
import type { ChatMessage } from "@/types/chat";
import {
  createDefaultImportantEventsLog,
  createImportantEvent,
  type ImportantEventsLog,
} from "@/types/importantEvents";
import {
  DEFAULT_PEEK_LINKS,
  peekSecretEventContent,
  peekSecretEventTag,
  type FoundSecret,
  type PeekLinkSettings,
} from "@/utils/peekLinks";

function keyOf(chatId: string): string {
  return `peek-links-${chatId}`;
}

export async function loadPeekLinks(chatId: string): Promise<PeekLinkSettings> {
  const saved = await db.get<Partial<PeekLinkSettings>>(DB_STORES.SETTINGS, keyOf(chatId));
  return {
    remember: saved?.remember ?? DEFAULT_PEEK_LINKS.remember,
    sendDraft: saved?.sendDraft ?? DEFAULT_PEEK_LINKS.sendDraft,
  };
}

export async function savePeekLinks(chatId: string, settings: PeekLinkSettings): Promise<void> {
  await db.put(DB_STORES.SETTINGS, { ...settings }, keyOf(chatId));
}

export async function deletePeekLinks(chatId: string): Promise<void> {
  await db.delete(DB_STORES.SETTINGS, keyOf(chatId));
}

/** 找到的秘密記成重要事件；同一個秘密只記一次，重要事件關掉的聊天不記 */
export async function rememberPeekSecret(
  chatId: string,
  characterId: string,
  found: FoundSecret,
  names: { userName: string; charName: string },
): Promise<boolean> {
  const log =
    (await db.get<ImportantEventsLog>(DB_STORES.IMPORTANT_EVENTS, chatId)) ??
    (await db.get<ImportantEventsLog>(DB_STORES.IMPORTANT_EVENTS, characterId)) ??
    createDefaultImportantEventsLog(characterId, chatId);
  if (!log.settings.enabled) return false;
  const tag = peekSecretEventTag(found.key);
  if (log.events.some((e) => e.tags?.includes(tag))) return false;
  const event = createImportantEvent(peekSecretEventContent(found, names.userName, names.charName), {
    category: "secret",
    priority: 2,
    source: "system",
    tags: ["偷看手機", tag],
  });
  const events = [event, ...log.events].slice(0, log.settings.maxEvents);
  await db.put(DB_STORES.IMPORTANT_EVENTS, JSON.parse(JSON.stringify({ ...log, events, updatedAt: Date.now() })));
  return true;
}

/** 加進聊天記錄，開著的聊天頁會重新讀 */
async function appendToChat(chatId: string, messages: ChatMessage[]): Promise<void> {
  await appendMessages(chatId, messages);
  // chatStorage 刪聊天時會刪這裡的開關，動態載入避免互相引用
  const { refreshChatDerivedMetadata } = await import("@/storage/chatStorage");
  await refreshChatDerivedMetadata(chatId).catch(() => undefined);
  try {
    window.dispatchEvent(new CustomEvent("aguaphone:chat-messages-appended", { detail: { chatId } }));
  } catch {
    // 非瀏覽器環境（測試）
  }
}

/** 被他發現、他起疑：聊天裡留一筆系統訊息；storyTime 是聊天的有效時間 */
export async function leavePeekNote(chatId: string, content: string, storyTime: number): Promise<void> {
  const now = Date.now();
  await appendToChat(chatId, [{
    id: `msg_peek_caught_${now}`,
    sender: "system",
    name: "system",
    content,
    is_user: false,
    status: "sent",
    createdAt: now,
    updatedAt: now,
    storyTime,
    isSystemNotification: true,
  }]);
}

/** 以他的身分加進聊天（幫他送出的草稿、被抓到時他的反應），一句一則 */
export async function sendCharMessages(
  chatId: string,
  charName: string,
  texts: string[],
  storyTime: number,
  /** 多人卡成員：訊息要掛他的成員 id，群聊才認得是誰說的 */
  sender?: { id: string; avatar?: string },
): Promise<void> {
  const now = Date.now();
  const messages: ChatMessage[] = texts.map((content, i) => ({
    id: `msg_peek_char_${now}_${i}`,
    sender: "assistant",
    name: charName,
    content,
    is_user: false,
    status: "sent",
    createdAt: now + i,
    updatedAt: now + i,
    storyTime: storyTime + i,
    ...(sender
      ? {
          senderCharacterId: sender.id,
          senderCharacterName: charName,
          senderCharacterAvatar: sender.avatar,
        }
      : {}),
  }));
  if (messages.length) await appendToChat(chatId, messages);
}

/** 幫他按送出：草稿以他的身分出現在聊天裡 */
export async function sendDraftAsChar(
  chatId: string,
  charName: string,
  text: string,
  storyTime: number,
  /** 多人卡成員：訊息要掛他的成員 id，群聊才認得是誰說的 */
  sender?: { id: string; avatar?: string },
): Promise<void> {
  await sendCharMessages(chatId, charName, [text], storyTime, sender);
}
