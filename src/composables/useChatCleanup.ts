import { onUnmounted, type Ref } from "vue";
import { leaveGameScreen } from "@/composables/useGamePlayingDetector";
import { proactiveMessageService } from "@/services/ProactiveMessageService";
import type { ChatScreenMessage as Message } from "@/types/chatScreen";

export function useChatCleanup(context: {
  characterId: string | undefined;
  showDishWashingGame: Ref<boolean>;
  showFishingGame: Ref<boolean>;
  showGamblingGame: Ref<boolean>;
  showMeritHub: Ref<boolean>;
  unregisterStreamingHandlers: () => void;
  isRecording: Ref<boolean>;
  cancelPendingSaveTimer: () => void;
  isChatGenerating: () => boolean;
  messages: Ref<Message[]>;
  getChatGenerationTask: () => { content?: string } | undefined;
  saveChatNow: () => void;
  hasPendingSave: () => boolean;
  currentChatId: Ref<string | null | undefined>;
  inputText: Ref<string>;
  chatStore: {
    saveDraft: (chatId: string, draft: string) => void;
    setAppearanceCache: (appearance: undefined) => void;
  };
  stopPendingCallChecker: () => void;
  cleanupLoadMoreObserver: () => void;
  applyChatAppearance: (appearance: undefined) => void;
  notificationStore: {
    setActiveChatId: (chatId: string | null) => void;
  };
  fakeTime: {
    stopDisplayTimer: () => void;
  };
}) {
  onUnmounted(() => {
    // 通知主動發訊服務：用戶離開此角色的聊天頁面，從現在起開始計算間隔。
    if (context.characterId) {
      proactiveMessageService.leaveChat(context.characterId);
    }

    // 若仍有遊戲模態框沒被關閉，這裡兜底清掉 detector 計時器。
    if (context.showDishWashingGame.value) leaveGameScreen("dishwashing");
    if (context.showFishingGame.value) leaveGameScreen("fishing");
    if (context.showGamblingGame.value) leaveGameScreen("gambling");
    if (context.showMeritHub.value) leaveGameScreen("merit");

    context.unregisterStreamingHandlers();

    // 清理錄音資源。
    if (context.isRecording.value) {
      context.isRecording.value = false;
    }

    // 如果有待處理的 debounce 儲存，立即執行（避免切換聊天時丟失數據）。
    context.cancelPendingSaveTimer();

    // 如果正在流式生成中，將已累積的內容寫入佔位符再保存。
    // 避免空氣泡被寫入 IDB；後台生成完成後 finally 會再次保存最終結果。
    const isCurrentlyStreaming = context.isChatGenerating();
    if (isCurrentlyStreaming) {
      const streamingIdx = context.messages.value.findIndex(
        (m) => m.isStreaming && m.role === "ai",
      );
      if (streamingIdx !== -1) {
        const task = context.getChatGenerationTask();
        const accumulatedContent = task?.content || "";
        if (accumulatedContent.trim()) {
          // 已有部分內容，寫入佔位符（保留 isStreaming 標記）。
          context.messages.value[streamingIdx].content = accumulatedContent;
        }
        // 注意：不移除佔位符！後台 triggerAIResponse 閉包仍需透過 findIndex 找到它
        // 來寫入最終完成的內容。
      }
      context.saveChatNow();
    } else if (context.hasPendingSave()) {
      context.saveChatNow();
    }

    if (context.currentChatId.value) {
      context.chatStore.saveDraft(
        context.currentChatId.value,
        context.inputText.value,
      );
    }

    context.stopPendingCallChecker();
    context.cleanupLoadMoreObserver();
    context.applyChatAppearance(undefined);
    context.chatStore.setAppearanceCache(undefined);
    context.notificationStore.setActiveChatId(null);
    context.fakeTime.stopDisplayTimer();

    // 注意：不在 onUnmounted 呼叫 _restoreGlobalPersona()
    // 因為它是 async fire-and-forget，會跟新聊天的 loadOrCreateChat 產生 race condition
    // 導致新聊天載入的 persona 被覆蓋回全局設定。
    // persona 恢復已由 loadOrCreateChat 內部處理（讀取 personaOverride 或呼叫 _restoreGlobalPersona）。
  });
}
