import {
  appendChatMessages,
  deleteChatMessage,
  deleteChatMessagesForChat,
  getChatMessageCount,
  loadChatMessages,
  saveChatMessages,
} from "@/db/chatMessageStore";
import { recordDeletedEntity, scheduleSelfHostedAutoSync } from "@/services/selfHostedSyncState";
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
  scheduleSelfHostedAutoSync();
}

export async function appendMessages(
  chatId: string,
  newMessages: ChatMessage[],
): Promise<void> {
  await appendChatMessages(chatId, newMessages);
  scheduleSelfHostedAutoSync();
}

export async function deleteMessage(
  messageId: string,
  options?: {
    chatId?: string;
    deletedAt?: number;
    suppressSyncDeletionRecord?: boolean;
  },
): Promise<void> {
  await deleteChatMessage(messageId);
  if (options?.suppressSyncDeletionRecord) {
    return;
  }
  await recordDeletedEntity({
    entityType: "chat_message",
    entityId: messageId,
    updatedAt: options?.deletedAt ?? Date.now(),
    deletedAt: options?.deletedAt ?? Date.now(),
    payload: {
      chatId: options?.chatId ?? null,
    },
  });
  scheduleSelfHostedAutoSync();
}

export async function deleteMessagesForChat(
  chatId: string,
  options?: { suppressAutoSync?: boolean },
): Promise<void> {
  await deleteChatMessagesForChat(chatId);
  if (!options?.suppressAutoSync) {
    scheduleSelfHostedAutoSync();
  }
}

export async function getMessageCount(chatId: string): Promise<number> {
  return getChatMessageCount(chatId);
}
