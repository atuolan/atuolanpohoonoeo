import { db, DB_STORES } from "@/db/database";
import {
  collectImageRefs,
  deleteChatImagesByRefs,
} from "@/db/operations";
import { deleteVectorsByChatId } from "@/db/vectorStore";
import {
  appendMessages,
  deleteMessagesForChat,
  loadMessages,
} from "@/storage/chatMessageStorage";
import type { Chat, ChatMessage } from "@/types/chat";

export async function loadChatById(chatId: string): Promise<Chat | undefined> {
  await db.init();
  return db.get<Chat>(DB_STORES.CHATS, chatId);
}

export async function loadAllChats(): Promise<Chat[]> {
  await db.init();
  return db.getAll<Chat>(DB_STORES.CHATS);
}

export async function loadChatsByCharacter(
  characterId: string,
  options?: { isGroupChat?: boolean },
): Promise<Chat[]> {
  const allChats = await loadAllChats();
  return allChats
    .filter((chat) => {
      if (chat.characterId !== characterId) return false;
      if (options?.isGroupChat === undefined) return true;
      return Boolean(chat.isGroupChat) === options.isGroupChat;
    })
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export async function saveChatMetadata(chat: Chat): Promise<void> {
  await db.init();
  await db.put(DB_STORES.CHATS, JSON.parse(JSON.stringify(chat)));
}

export async function createChatRecord(
  chat: Chat,
  initialMessages: ChatMessage[] = [],
): Promise<void> {
  await saveChatMetadata(chat);
  if (initialMessages.length > 0) {
    await appendMessages(chat.id, initialMessages);
  }
}

export async function renameChat(chatId: string, newName: string): Promise<Chat | undefined> {
  const chat = await loadChatById(chatId);
  if (!chat) return undefined;
  chat.name = newName;
  chat.updatedAt = Date.now();
  await saveChatMetadata(chat);
  return chat;
}

export async function toggleChatPinned(chatId: string): Promise<Chat | undefined> {
  const chat = await loadChatById(chatId);
  if (!chat) return undefined;
  chat.pinnedToList = !chat.pinnedToList;
  chat.updatedAt = Date.now();
  await saveChatMetadata(chat);
  return chat;
}

export async function setLastActiveChatId(
  characterId: string,
  chatId: string,
): Promise<void> {
  await db.init();
  await db.put(DB_STORES.SETTINGS, chatId, `lastActiveChatId_${characterId}`);
}

export async function getLastActiveChatId(
  characterId: string,
): Promise<string | undefined> {
  await db.init();
  return db.get<string>(DB_STORES.SETTINGS, `lastActiveChatId_${characterId}`);
}

export async function deleteChatCascade(chatId: string): Promise<void> {
  const chatMessages = await loadMessages(chatId);
  const imageRefs = collectImageRefs(chatMessages);

  await Promise.all([
    db.delete(DB_STORES.CHATS, chatId),
    deleteMessagesForChat(chatId),
    deleteChatImagesByRefs(imageRefs),
  ]);

  deleteVectorsByChatId(chatId).catch((err) =>
    console.error("[向量記憶] 刪除聊天向量失敗:", err),
  );
}

export async function loadChatWithMessages(
  chatId: string,
): Promise<{ chat: Chat; messages: ChatMessage[] } | null> {
  const chat = await loadChatById(chatId);
  if (!chat) return null;
  const messages = await loadMessages(chatId);
  return { chat, messages };
}
