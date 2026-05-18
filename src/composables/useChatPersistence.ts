import { toRaw, type Ref } from "vue";
import { extractAudioFromMessages, extractImagesFromMessages } from "@/db/operations";
import { getMessageCount, loadMessages, saveMessages } from "@/storage/chatMessageStorage";
import {
  loadChatById,
  refreshChatDerivedMetadata,
  resolvePreferredDirectChat,
  saveChatMetadata,
} from "@/storage/chatStorage";
import type { Chat, ChatMessage } from "@/types/chat";
import type { ChatScreenMessage } from "@/types/chatScreen";

export interface UseChatPersistenceDeps {
  messages: Ref<ChatScreenMessage[]>;
  currentChatId: Ref<string | null>;
  currentChatData: Ref<Chat | null>;
  getCharName: () => string;
  getDirectCharacterId: () => string;
  convertToStorableMessage: (message: ChatScreenMessage, charName: string) => ChatMessage;
  buildChatMetadata: (messages: ChatMessage[], charName: string) => Chat;
  initChatVariables: (chatId: string) => void;
  refreshBlockStateFromStorage: () => Promise<unknown>;
}

export function useChatPersistence(deps: UseChatPersistenceDeps) {
  let lastSavedMessageCount = 0;
  let lastSavedLastMessageId = "";
  let lastSavedMessageIds: string[] = [];
  let messagesLoadedAt = 0;
  let saveChatTimer: ReturnType<typeof setTimeout> | null = null;
  let saveChatPending = false;
  let saveChatLock: Promise<void> | null = null;

  function markMessagesLoaded(timestamp = Date.now()) {
    messagesLoadedAt = timestamp;
  }

  function resetSaveTrackingFromMessages() {
    lastSavedMessageCount = deps.messages.value.length;
    lastSavedLastMessageId =
      deps.messages.value.length > 0
        ? deps.messages.value[deps.messages.value.length - 1].id
        : "";
    lastSavedMessageIds = deps.messages.value.map((m) => m.id);
  }

  function cancelPendingSaveTimer() {
    if (saveChatTimer) {
      clearTimeout(saveChatTimer);
      saveChatTimer = null;
    }
  }

  function hasPendingSave() {
    return saveChatPending;
  }

  function resetAfterChatCleared() {
    cancelPendingSaveTimer();
    saveChatPending = false;
    lastSavedMessageCount = 0;
    lastSavedLastMessageId = "";
    lastSavedMessageIds = [];
    messagesLoadedAt = Date.now();
  }

  async function saveChatImplInner() {
    const charName = deps.getCharName();
    const messagesSnapshot = [...deps.messages.value];
    const storableMessages = messagesSnapshot.map((m) =>
      deps.convertToStorableMessage(m, charName),
    );

    if (!deps.currentChatId.value) {
      const directCharacterId = deps.getDirectCharacterId();
      if (directCharacterId) {
        const preferredChat = await resolvePreferredDirectChat(directCharacterId);
        if (preferredChat) {
          deps.currentChatId.value = preferredChat.id;
          deps.currentChatData.value = preferredChat;
        }
      }

      if (!deps.currentChatId.value) {
        if (storableMessages.length === 0) {
          saveChatPending = false;
          return;
        }
        deps.currentChatId.value = `chat_${Date.now()}`;
        deps.initChatVariables(deps.currentChatId.value);
      }
    }

    try {
      const afterImageExtract = await extractImagesFromMessages(storableMessages);
      const messagesForStorage = await extractAudioFromMessages(afterImageExtract);
      const chat = deps.buildChatMetadata(messagesForStorage, charName);

      console.log(
        "[ChatScreen] 保存聊天，外觀:",
        chat.appearance
          ? {
              useCustom: chat.appearance.useCustom,
              wallpaperType: chat.appearance.wallpaper?.type,
              wallpaperValueLength: chat.appearance.wallpaper?.value?.length,
            }
          : "undefined",
      );

      const currentCount = messagesForStorage.length;
      const currentLastId =
        messagesForStorage.length > 0
          ? messagesForStorage[messagesForStorage.length - 1].id
          : "";

      let plainChat: any;
      try {
        plainChat = structuredClone(toRaw(chat));
      } catch {
        plainChat = JSON.parse(JSON.stringify(toRaw(chat)));
      }

      const plainMessages = plainChat.messages || [];
      const localCount = plainMessages.length;

      let latestFromDb: any = null;
      try {
        latestFromDb = await loadChatById(plainChat.id);
      } catch {
      }

      if (latestFromDb) {
        let dbCount = 0;
        try {
          dbCount = await getMessageCount(plainChat.id);
        } catch {
          dbCount = latestFromDb.messageCount || 0;
        }
        if (dbCount >= 5 && localCount <= 2) {
          let localIdsExistInDb = false;
          try {
            const dbMessages = await loadMessages(plainChat.id);
            const dbIds = new Set(dbMessages.map((m) => m.id));
            localIdsExistInDb =
              plainMessages.length > 0 &&
              plainMessages.every((m: any) => dbIds.has(m.id));
          } catch {
          }
          if (!localIdsExistInDb) {
            console.error(
              `[ChatScreen] ⚠️ 安全閘門觸發！拒絕保存：IDB 實際訊息數=${dbCount}，本地只有 ${localCount} 條且 ID 不在 IDB 中。`,
              "可能是 ChatScreen 以錯誤上下文重新初始化，跳過此次保存以保護資料。",
              {
                chatId: plainChat.id,
                localIds: plainMessages.slice(0, 3).map((m: any) => m.id),
              },
            );
            saveChatPending = false;
            return;
          }
        }
      }

      if (latestFromDb?.blockState) {
        plainChat.blockState = latestFromDb.blockState;
      }

      await saveMessages(plainChat.id, plainMessages, messagesLoadedAt || undefined);
      plainChat.messages = [];
      await saveChatMetadata(plainChat);
      await refreshChatDerivedMetadata(plainChat.id);

      if (import.meta.env.DEV) {
        try {
          const savedCount = await getMessageCount(deps.currentChatId.value!);
          if (savedCount !== localCount) {
            console.error(
              "[ChatScreen] ⚠️ 保存後回讀數量不一致！寫入:",
              localCount,
              "讀回:",
              savedCount,
            );
          }
        } catch (verifyErr) {
          console.warn("[ChatScreen] 回讀驗證失敗:", verifyErr);
        }
      }

      lastSavedMessageCount = currentCount;
      lastSavedLastMessageId = currentLastId;
      lastSavedMessageIds = messagesForStorage.map((m) => m.id);
      saveChatPending = false;
    } catch (e) {
      console.error("保存聊天失敗:", e);
    }
  }

  async function runSaveNow() {
    if (saveChatLock) {
      try {
        await saveChatLock;
      } catch {
      }
    }
    saveChatLock = saveChatImplInner();
    try {
      await saveChatLock;
    } finally {
      saveChatLock = null;
    }
  }

  function saveChat() {
    saveChatPending = true;
    cancelPendingSaveTimer();
    saveChatTimer = setTimeout(() => {
      saveChatTimer = null;
      runSaveNow();
    }, 400);
  }

  async function saveChatImmediate() {
    cancelPendingSaveTimer();
    await runSaveNow();
    await deps.refreshBlockStateFromStorage();
  }

  return {
    markMessagesLoaded,
    resetSaveTrackingFromMessages,
    resetAfterChatCleared,
    cancelPendingSaveTimer,
    hasPendingSave,
    runSaveNow,
    saveChat,
    saveChatImmediate,
  };
}
