import {
  appendChatMessages,
  deleteChatMessage,
  deleteChatMessagesForChat,
  getChatMessageCount,
  loadChatMessages,
  saveChatMessages,
} from "@/db/chatMessageStore";
import type { ChatMessage } from "@/types/chat";

export async function loadMessages(chatId: string): Promise<ChatMessage[]> {
  return loadChatMessages(chatId);
}

export async function saveMessages(
  chatId: string,
  messages: ChatMessage[],
  snapshotTime?: number,
): Promise<void> {
  await saveChatMessages(chatId, messages, snapshotTime);
}

export async function appendMessages(
  chatId: string,
  newMessages: ChatMessage[],
): Promise<void> {
  await appendChatMessages(chatId, newMessages);
}

export async function deleteMessage(messageId: string): Promise<void> {
  await deleteChatMessage(messageId);
}

export async function deleteMessagesForChat(chatId: string): Promise<void> {
  await deleteChatMessagesForChat(chatId);
}

export async function getMessageCount(chatId: string): Promise<number> {
  return getChatMessageCount(chatId);
}
