import { nextTick, ref, watch, type Ref } from "vue";
import { CHAT_SKIN_VAR_PROPS } from "@/data/chatSkins";
import type { ChatAppearance, GlobalChatAppearance } from "@/types/chat";
import {
  ALL_CHAT_APPEARANCE_PROPS,
  buildChatAppearanceVars,
  type GlobalBubbleInfo,
  type GlobalWallpaperInfo,
} from "@/utils/chatAppearanceVars";

interface ChatAppearanceContext {
  chatScreenRef: Ref<HTMLElement | null>;
  settingsStore: {
    nightMode: boolean;
  };
  themeStore: {
    wallpaperStyle: GlobalWallpaperInfo;
    /** 沒有專屬外觀的聊天使用的全域聊天外觀 */
    globalChatAppearance?: GlobalChatAppearance | null;
    bubbleStyle?: GlobalBubbleInfo;
  };
  chatStore: {
    updateAppearance: (appearance: ChatAppearance) => void;
    setAppearanceCache: (appearance?: ChatAppearance) => void;
  };
  saveChat: () => void | Promise<void>;
  getPendingAppearance?: () => ChatAppearance | undefined;
  /** 聊天裝扮部件的配色變數，排在玩家外觀之後 */
  getSkinVars?: () => Record<string, string>;
  onAppearanceApplied?: () => void;
}

export function useChatAppearance(context: ChatAppearanceContext) {
  const chatAppearance = ref<ChatAppearance | undefined>(undefined);

  function saveAppearance(appearance: ChatAppearance) {
    context.chatStore.updateAppearance(appearance);
    chatAppearance.value = appearance;
    nextTick(() => {
      applyChatAppearance(appearance);
    });
    void context.saveChat();
  }

  /**
   * 每次都先清掉所有聊天外觀變數再重新寫入，
   * 避免切換夜間模式或關閉專屬外觀時殘留上一次的值。
   */
  function applyChatAppearance(appearance?: ChatAppearance) {
    const container = context.chatScreenRef.value;
    if (!container) return;

    for (const property of [...ALL_CHAT_APPEARANCE_PROPS, ...CHAT_SKIN_VAR_PROPS]) {
      container.style.removeProperty(property);
    }
    const vars = buildChatAppearanceVars(appearance, {
      nightMode: context.settingsStore.nightMode,
      globalWallpaper: context.themeStore.wallpaperStyle,
      globalChat: context.themeStore.globalChatAppearance,
      globalBubble: context.themeStore.bubbleStyle,
    });
    Object.assign(vars, context.getSkinVars?.() ?? {});
    for (const [property, value] of Object.entries(vars)) {
      container.style.setProperty(property, value);
    }
  }

  watch(
    () => context.settingsStore.nightMode,
    () => {
      nextTick(() => applyChatAppearance(chatAppearance.value));
    },
  );

  // 跟隨全域桌布／全域聊天外觀的聊天，要在全域設定變動時同步更新
  watch(
    () => [
      context.themeStore.wallpaperStyle,
      context.themeStore.globalChatAppearance,
      context.themeStore.bubbleStyle,
    ],
    () => {
      nextTick(() => applyChatAppearance(chatAppearance.value));
    },
    { deep: true },
  );

  // 換了裝扮部件（裝上、卸下、試穿、自己的顏色）也要重新套用
  if (context.getSkinVars) {
    watch(
      context.getSkinVars,
      () => {
        nextTick(() => applyChatAppearance(chatAppearance.value));
      },
      { deep: true },
    );
  }

  if (context.getPendingAppearance) {
    watch(
      context.getPendingAppearance,
      (newAppearance: ChatAppearance | undefined) => {
        if (!newAppearance) return;
        chatAppearance.value = newAppearance;
        context.chatStore.setAppearanceCache(newAppearance);
        nextTick(() => {
          applyChatAppearance(newAppearance);
          void context.saveChat();
          context.onAppearanceApplied?.();
        });
      },
      { deep: true },
    );
  }

  return {
    chatAppearance,
    saveAppearance,
    applyChatAppearance,
  };
}
