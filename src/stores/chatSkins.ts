/**
 * 聊天裝扮的執行期狀態
 *
 * - 試穿：只存在記憶體，結束或關掉 App 就沒了
 * - 單聊另選：聊天載入時 prime 進來；外觀設定改了用 set，聊天畫面看 editRevision 決定要不要存檔
 */
import { defineStore } from "pinia";
import { ref } from "vue";
import {
  normalizeChatSkinOverrides,
  type ChatSkinOverrides,
  type ChatSkinTryOn,
} from "@/utils/chatSkinResolve";

export const useChatSkinsStore = defineStore("chatSkins", () => {
  const tryOn = ref<ChatSkinTryOn | null>(null);
  const chatOverrides = ref<Record<string, ChatSkinOverrides>>({});
  /** 使用者在外觀設定改了單聊裝扮就 +1 */
  const editRevision = ref(0);
  const lastEditedChatId = ref<string | null>(null);

  function startTryOn(value: ChatSkinTryOn) {
    tryOn.value = { ...value };
  }

  function endTryOn() {
    tryOn.value = null;
  }

  /** 聊天載入時放進存檔裡的單聊設定（不算修改，不會觸發存檔） */
  function primeChatOverrides(chatId: string, overrides: ChatSkinOverrides | null | undefined) {
    chatOverrides.value = { ...chatOverrides.value, [chatId]: normalizeChatSkinOverrides(overrides) };
  }

  /** 外觀設定改了單聊裝扮 */
  function setChatOverrides(chatId: string, overrides: ChatSkinOverrides | null | undefined) {
    primeChatOverrides(chatId, overrides);
    lastEditedChatId.value = chatId;
    editRevision.value += 1;
  }

  function getChatOverrides(chatId: string | null | undefined): ChatSkinOverrides {
    if (!chatId) return {};
    return chatOverrides.value[chatId] ?? {};
  }

  return {
    tryOn,
    chatOverrides,
    editRevision,
    lastEditedChatId,
    startTryOn,
    endTryOn,
    primeChatOverrides,
    setChatOverrides,
    getChatOverrides,
  };
});
