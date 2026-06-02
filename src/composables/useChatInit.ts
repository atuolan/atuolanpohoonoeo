import { nextTick, type Ref } from "vue";
import { proactiveMessageService } from "@/services/ProactiveMessageService";
import type { ChatScreenMessage as Message } from "@/types/chatScreen";

export function useChatInit(context: {
  characterId: string | undefined;
  regexScriptsStore: { init: () => void };
  loadAudioSettings: () => void | Promise<void>;
  registerStreamingHandlers: () => void;
  userStore: {
    isLoaded: boolean;
    loadUserData: () => Promise<void>;
  };
  stickerStore: {
    initialized: boolean;
    init: () => Promise<void>;
  };
  weatherStore: {
    hasWeatherData: boolean;
    refreshWeather: () => Promise<unknown>;
  };
  messages: Ref<Message[]>;
  currentChatId: Ref<string | null | undefined>;
  isChatGenerating: () => boolean;
  getChatGenerationTask: () => { content?: string } | undefined;
  loadOrCreateChat: () => Promise<unknown>;
  markInitialChatLoadDone: () => void;
  startPendingCallChecker: () => void;
  notificationStore: {
    setActiveChatId: (chatId: string | null) => void;
  };
  setupLoadMoreObserver: () => void;
}) {
  async function initializeChatScreen() {
    // 通知主動發訊服務：用戶進入此角色的聊天頁面。
    if (context.characterId) {
      proactiveMessageService.enterChat(context.characterId);
    }

    // 初始化全域 regex 腳本。
    context.regexScriptsStore.init();

    // 載入音頻設定。
    await context.loadAudioSettings();

    // 註冊流式窗口全局事件監聽。
    context.registerStreamingHandlers();

    // 載入使用者資料。
    if (!context.userStore.isLoaded) {
      await context.userStore.loadUserData();
    }

    // 載入表情包資料。
    if (!context.stickerStore.initialized) {
      await context.stickerStore.init();
    }

    // 載入天氣數據（如果還沒有）。
    if (!context.weatherStore.hasWeatherData) {
      context.weatherStore.refreshWeather().catch((e) => {
        console.warn("[ChatScreen] 載入天氣失敗:", e);
      });
    }

    context.loadOrCreateChat().then(() => {
      context.markInitialChatLoadDone();

      // 如果後台仍有生成任務在跑，標記最後一條 AI 訊息為 streaming。
      // 這樣用戶回到聊天時能看到打字動畫而非空氣泡。
      if (context.isChatGenerating()) {
        const lastAI = [...context.messages.value]
          .reverse()
          .find((m) => m.role === "ai");
        if (lastAI) {
          lastAI.isStreaming = true;
          // 如果全局 store 有累積內容，同步到訊息中。
          const task = context.getChatGenerationTask();
          if (task?.content && task.content.trim()) {
            lastAI.content = task.content;
          }
        }
      }
    });

    // 啟動待處理來電檢查。
    context.startPendingCallChecker();

    // 設置當前活躍聊天 ID（用於通知判斷）。
    context.notificationStore.setActiveChatId(context.currentChatId.value ?? null);

    // 設置「載入更多」哨兵的 IntersectionObserver。
    nextTick(() => {
      context.setupLoadMoreObserver();
    });
  }

  return {
    initializeChatScreen,
  };
}
