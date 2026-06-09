import { nextTick, ref, watch, type Ref } from "vue";
import type { ChatAppearance } from "@/types/chat";
import { hexToRgba } from "@/utils/chatScreenHelpers";

interface ChatAppearanceContext {
  chatScreenRef: Ref<HTMLElement | null>;
  settingsStore: {
    nightMode: boolean;
  };
  themeStore: {
    wallpaperStyle: {
      type?: string;
      value?: string;
      blur?: number;
      opacity?: number;
      fit?: "cover" | "contain" | "fill" | "repeat";
    };
  };
  chatStore: {
    updateAppearance: (appearance: ChatAppearance) => void;
    setAppearanceCache: (appearance?: ChatAppearance) => void;
  };
  saveChat: () => void | Promise<void>;
  getPendingAppearance?: () => ChatAppearance | undefined;
  onAppearanceApplied?: () => void;
}

const CHAT_APPEARANCE_COLOR_PROPS = [
  "--color-primary",
  "--color-primary-light",
  "--color-background",
  "--chat-header-surface",
  "--color-surface",
  "--color-surface-hover",
  "--chat-header-text",
  "--color-text",
  "--chat-header-text-secondary",
  "--color-text-secondary",
  "--color-text-muted",
  "--color-secondary",
  "--color-border",
  "--color-shadow",
  "--color-success",
  "--color-error",
  "--color-warning",
];

const CHAT_APPEARANCE_BUBBLE_PROPS = [
  "--bubble-user-bg",
  "--bubble-user-text",
  "--bubble-ai-bg",
  "--bubble-ai-text",
  "--bubble-ai-content",
  "--bubble-radius",
  "--bubble-max-width",
  "--chat-bubble-user-bg",
  "--chat-bubble-user-text",
  "--chat-bubble-ai-bg",
  "--chat-bubble-ai-text",
  "--chat-bubble-ai-content",
  "--thought-bg",
  "--thought-text",
  "--thought-glow-1",
  "--thought-glow-2",
  "--thought-glow-3",
];

const CHAT_APPEARANCE_AVATAR_PROPS = [
  "--avatar-border-radius",
  "--avatar-size",
  "--avatar-border-width",
  "--avatar-border-color",
  "--avatar-shadow",
];

const CHAT_APPEARANCE_WALLPAPER_PROPS = [
  "--chat-wallpaper",
  "--chat-wallpaper-blur",
  "--chat-wallpaper-opacity",
  "--chat-wallpaper-fit",
  "--chat-wallpaper-repeat",
];

const CHAT_APPEARANCE_FONT_PROPS = [
  "--chat-font-size",
  "--chat-font-family",
  "--chat-line-height",
  "--chat-letter-spacing",
  "--chat-md-text",
  "--chat-md-italic",
  "--chat-md-bold",
  "--chat-md-underline",
  "--chat-md-strikethrough",
  "--chat-md-highlight",
  "--chat-md-quote",
  "--chat-md-code",
  "--chat-md-heading",
];

const ALL_CHAT_APPEARANCE_PROPS = [
  ...CHAT_APPEARANCE_COLOR_PROPS,
  ...CHAT_APPEARANCE_BUBBLE_PROPS,
  ...CHAT_APPEARANCE_AVATAR_PROPS,
  ...CHAT_APPEARANCE_WALLPAPER_PROPS,
  ...CHAT_APPEARANCE_FONT_PROPS,
];

function removeStyleProperties(container: HTMLElement, properties: string[]) {
  for (const property of properties) {
    container.style.removeProperty(property);
  }
}

function setNightModeAppearance(container: HTMLElement) {
  container.style.setProperty("--bubble-user-bg", "#2a4a3a");
  container.style.setProperty("--bubble-user-text", "#e0f0e8");
  container.style.setProperty("--bubble-ai-bg", "#1e2a40");
  container.style.setProperty("--bubble-ai-text", "#d8d8e8");
  container.style.setProperty("--bubble-ai-content", "#d8d8e8");
  container.style.setProperty("--chat-bubble-user-bg", "#2a4a3a");
  container.style.setProperty("--chat-bubble-user-text", "#e0f0e8");
  container.style.setProperty("--chat-bubble-ai-bg", "#1e2a40");
  container.style.setProperty("--chat-bubble-ai-text", "#d8d8e8");
  container.style.setProperty("--chat-bubble-ai-content", "#d8d8e8");
  // 夜晚模式下的 markdown 顏色覆寫，避免淺色背景下的顏色（如引用文字 #8b5a2b）
  // 在深色氣泡背景下對比度過低、難以閱讀
  container.style.setProperty("--chat-md-quote", "#e8b88a");
}

function clearNightModeAppearance(container: HTMLElement) {
  removeStyleProperties(container, [
    "--bubble-user-bg",
    "--bubble-user-text",
    "--bubble-ai-bg",
    "--bubble-ai-text",
    "--bubble-ai-content",
    "--chat-bubble-user-bg",
    "--chat-bubble-user-text",
    "--chat-bubble-ai-bg",
    "--chat-bubble-ai-text",
    "--chat-bubble-ai-content",
    "--chat-md-quote",
  ]);
}

export function useChatAppearance(context: ChatAppearanceContext) {
  const chatAppearance = ref<ChatAppearance | undefined>(undefined);

  function saveAppearance(appearance: ChatAppearance) {
    console.log(
      "[useChatAppearance] saveAppearance 收到:",
      JSON.stringify(appearance.wallpaper, null, 2),
    );
    context.chatStore.updateAppearance(appearance);
    chatAppearance.value = appearance;
    nextTick(() => {
      applyChatAppearance(appearance);
    });
    void context.saveChat();
  }

  function applyChatAppearance(appearance?: ChatAppearance) {
    const container = context.chatScreenRef.value;
    if (!container) return;

    if (context.settingsStore.nightMode) {
      setNightModeAppearance(container);
      removeStyleProperties(container, [
        "--bubble-radius",
        "--bubble-max-width",
        "--color-primary",
        "--color-primary-light",
        "--color-background",
        "--chat-header-surface",
        "--chat-header-text",
        "--chat-header-text-secondary",
        ...CHAT_APPEARANCE_AVATAR_PROPS,
        ...CHAT_APPEARANCE_WALLPAPER_PROPS,
        ...CHAT_APPEARANCE_FONT_PROPS,
        "--thought-bg",
        "--thought-text",
        "--thought-glow-1",
        "--thought-glow-2",
        "--thought-glow-3",
      ]);
      return;
    }

    if (!appearance || !appearance.useCustom) {
      removeStyleProperties(container, ALL_CHAT_APPEARANCE_PROPS);
      return;
    }

    if (appearance.colors) {
      container.style.setProperty("--color-primary", appearance.colors.primary);
      container.style.setProperty("--color-primary-light", appearance.colors.primaryLight);
      if (appearance.colors.background) container.style.setProperty("--color-background", appearance.colors.background);
      else container.style.removeProperty("--color-background");
      if (appearance.colors.surface) {
        container.style.setProperty("--chat-header-surface", appearance.colors.surface);
        container.style.setProperty("--color-surface", appearance.colors.surface);
      } else {
        container.style.removeProperty("--chat-header-surface");
        container.style.removeProperty("--color-surface");
      }
      if (appearance.colors.surfaceHover) container.style.setProperty("--color-surface-hover", appearance.colors.surfaceHover);
      else container.style.removeProperty("--color-surface-hover");
      if (appearance.colors.text) {
        container.style.setProperty("--chat-header-text", appearance.colors.text);
        container.style.setProperty("--color-text", appearance.colors.text);
      } else {
        container.style.removeProperty("--chat-header-text");
        container.style.removeProperty("--color-text");
      }
      if (appearance.colors.textSecondary) {
        container.style.setProperty("--chat-header-text-secondary", appearance.colors.textSecondary);
        container.style.setProperty("--color-text-secondary", appearance.colors.textSecondary);
      } else {
        container.style.removeProperty("--chat-header-text-secondary");
        container.style.removeProperty("--color-text-secondary");
      }
      const optionalColors = [
        ["textMuted", "--color-text-muted"],
        ["secondary", "--color-secondary"],
        ["border", "--color-border"],
        ["shadow", "--color-shadow"],
        ["success", "--color-success"],
        ["error", "--color-error"],
        ["warning", "--color-warning"],
      ] as const;
      for (const [key, cssVar] of optionalColors) {
        const value = appearance.colors[key];
        if (value) container.style.setProperty(cssVar, value);
        else container.style.removeProperty(cssVar);
      }
    } else {
      removeStyleProperties(container, CHAT_APPEARANCE_COLOR_PROPS.filter((prop) => prop !== "--color-primary" && prop !== "--color-primary-light"));
    }

    if (appearance.avatar) {
      const avatarRadius =
        appearance.avatar.shape === "circle"
          ? "50%"
          : appearance.avatar.shape === "square"
            ? "8px"
            : "16px";
      const avatarSize =
        appearance.avatar.size === "small"
          ? "36px"
          : appearance.avatar.size === "medium"
            ? "48px"
            : "64px";
      container.style.setProperty("--avatar-border-radius", avatarRadius);
      container.style.setProperty("--avatar-size", avatarSize);
      container.style.setProperty("--avatar-border-width", `${appearance.avatar.borderWidth}px`);
      container.style.setProperty("--avatar-border-color", appearance.avatar.borderColor);
      container.style.setProperty(
        "--avatar-shadow",
        appearance.avatar.shadowEnabled ? "0 4px 12px var(--color-shadow)" : "none",
      );
    }

    if (appearance.bubble) {
      const userTextGradient = appearance.bubble.userTextGradient || "";
      const aiTextGradient = appearance.bubble.aiTextGradient || "";
      const aiContentGradient = appearance.bubble.aiContentGradient || "";
      const thoughtTextGradient = appearance.bubble.thoughtTextGradient || "";
      const thoughtBgGradient = appearance.bubble.thoughtBgGradient || "";
      const aiContentSolid = appearance.bubble.aiContentColor ?? appearance.bubble.aiTextColor;

      container.style.setProperty("--bubble-user-bg", appearance.bubble.userBgGradient || appearance.bubble.userBgColor);
      container.style.setProperty("--bubble-user-text", appearance.bubble.userTextColor);
      container.style.setProperty("--bubble-user-text-gradient", userTextGradient || "none");
      container.style.setProperty("--bubble-user-text-fill", userTextGradient ? "transparent" : appearance.bubble.userTextColor);
      container.style.setProperty("--bubble-ai-bg", appearance.bubble.aiBgGradient || appearance.bubble.aiBgColor);
      container.style.setProperty("--bubble-ai-text", appearance.bubble.aiTextColor);
      container.style.setProperty("--bubble-ai-text-gradient", aiTextGradient || "none");
      container.style.setProperty("--bubble-ai-text-fill", aiTextGradient ? "transparent" : appearance.bubble.aiTextColor);
      container.style.setProperty("--bubble-ai-content", aiContentSolid);
      container.style.setProperty("--bubble-ai-content-gradient", aiContentGradient || "none");
      container.style.setProperty("--bubble-ai-content-fill", aiContentGradient ? "transparent" : aiContentSolid);
      container.style.setProperty("--bubble-radius", `${appearance.bubble.borderRadius}px`);
      container.style.setProperty("--bubble-max-width", `${appearance.bubble.maxWidth}%`);
      const tBg = appearance.bubble.thoughtBgColor ?? "#ADD8E6";
      const tGlow = appearance.bubble.thoughtGlowColor ?? "#ADD8E6";
      const tOpacity = appearance.bubble.thoughtGlowOpacity ?? 0.6;
      const tText = appearance.bubble.thoughtTextColor ?? "#4a6572";
      container.style.setProperty("--thought-bg", thoughtBgGradient || hexToRgba(tBg, 0.9));
      container.style.setProperty("--thought-text", tText);
      container.style.setProperty("--thought-text-gradient", thoughtTextGradient || "none");
      container.style.setProperty("--thought-text-fill", thoughtTextGradient ? "transparent" : tText);
      container.style.setProperty("--thought-glow-1", hexToRgba(tGlow, tOpacity));
      container.style.setProperty("--thought-glow-2", hexToRgba(tGlow, tOpacity * 0.6));
      container.style.setProperty("--thought-glow-3", hexToRgba(tGlow, tOpacity * 0.3));
    } else {
      removeStyleProperties(container, [
        "--bubble-user-bg",
        "--bubble-user-text",
        "--bubble-user-text-gradient",
        "--bubble-user-text-fill",
        "--bubble-ai-bg",
        "--bubble-ai-text",
        "--bubble-ai-text-gradient",
        "--bubble-ai-text-fill",
        "--bubble-ai-content",
        "--bubble-ai-content-gradient",
        "--bubble-ai-content-fill",
        "--bubble-radius",
        "--bubble-max-width",
        "--thought-bg",
        "--thought-text",
        "--thought-text-gradient",
        "--thought-text-fill",
        "--thought-glow-1",
        "--thought-glow-2",
        "--thought-glow-3",
      ]);
    }

    if (appearance.wallpaper) {
      let wallpaperValue: string;
      let wallpaperBlur = appearance.wallpaper.blur ?? 0;
      let wallpaperOpacity = appearance.wallpaper.opacity ?? 100;
      let wallpaperFit = appearance.wallpaper.fit || "cover";

      const toImageWallpaper = (imageUrl: string) => {
        if (
          imageUrl &&
          (imageUrl.startsWith("data:") || imageUrl.startsWith("blob:") || imageUrl.startsWith("http"))
        ) {
          return `url("${imageUrl}")`;
        }
        return "var(--wallpaper-value, var(--color-background))";
      };

      if (appearance.wallpaper.type === "image") {
        wallpaperValue = toImageWallpaper(appearance.wallpaper.value);
        if (wallpaperValue.startsWith("var(")) {
          console.warn("[useChatAppearance] 無效的桌布圖片 URL，使用全局桌布");
        }
      } else if (appearance.wallpaper.type === "global-image") {
        if (context.themeStore.wallpaperStyle.type === "image") {
          wallpaperValue = toImageWallpaper(context.themeStore.wallpaperStyle.value || "");
          wallpaperBlur = context.themeStore.wallpaperStyle.blur ?? wallpaperBlur;
          wallpaperOpacity = context.themeStore.wallpaperStyle.opacity ?? wallpaperOpacity;
          wallpaperFit = context.themeStore.wallpaperStyle.fit || wallpaperFit;
        } else {
          wallpaperValue = "var(--wallpaper-value, var(--color-background))";
        }
      } else if (appearance.wallpaper.type === "time-theme") {
        wallpaperValue = "var(--time-theme-bg, var(--wallpaper-value, var(--color-background)))";
      } else if (appearance.wallpaper.type === "gradient" || appearance.wallpaper.type === "color") {
        wallpaperValue = appearance.wallpaper.value || "var(--wallpaper-value, var(--color-background))";
      } else {
        wallpaperValue = appearance.wallpaper.value || "var(--wallpaper-value, var(--color-background))";
      }

      console.log("[useChatAppearance] 套用桌布:", {
        type: appearance.wallpaper.type,
        value: wallpaperValue,
        blur: wallpaperBlur,
        opacity: wallpaperOpacity,
      });
      container.style.setProperty("--chat-wallpaper", wallpaperValue);
      container.style.setProperty("--chat-wallpaper-blur", `${wallpaperBlur}px`);
      container.style.setProperty("--chat-wallpaper-opacity", `${wallpaperOpacity / 100}`);
      const bgSize = wallpaperFit === "repeat" ? "auto" : wallpaperFit === "fill" ? "100% 100%" : wallpaperFit;
      container.style.setProperty("--chat-wallpaper-fit", bgSize);
      container.style.setProperty("--chat-wallpaper-repeat", wallpaperFit === "repeat" ? "repeat" : "no-repeat");
    } else {
      removeStyleProperties(container, CHAT_APPEARANCE_WALLPAPER_PROPS);
    }

    if (appearance.font) {
      const fontSize =
        typeof appearance.font.size === "string" && appearance.font.size.endsWith("px")
          ? appearance.font.size
          : appearance.font.size === "small"
            ? "14px"
            : appearance.font.size === "medium"
              ? "15px"
              : "17px";
      const fontFamily =
        appearance.font.family === "system"
          ? '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
          : appearance.font.family === "rounded"
            ? '"Nunito", "Noto Sans TC", -apple-system, sans-serif'
            : appearance.font.family === "serif"
              ? '"Noto Serif TC", "Georgia", serif'
              : '"Fira Code", "Source Code Pro", monospace';
      container.style.setProperty("--chat-font-size", fontSize);
      container.style.setProperty("--chat-font-family", fontFamily);
      container.style.setProperty("--chat-line-height", `${appearance.font.lineHeight ?? 1.6}`);
      container.style.setProperty("--chat-letter-spacing", `${appearance.font.letterSpacing ?? 0}px`);

      if (appearance.font.markdownColors) {
        const mc = appearance.font.markdownColors;
        container.style.setProperty("--chat-md-italic", mc.italic || "#8b7355");
        container.style.setProperty("--chat-md-bold", mc.bold || "#4a4a6a");
        container.style.setProperty("--chat-md-underline", mc.underline || "#8b2942");
        container.style.setProperty("--chat-md-strikethrough", mc.strikethrough || "#999999");
        container.style.setProperty("--chat-md-highlight", mc.highlight || "#fff3cd");
        container.style.setProperty("--chat-md-quote", mc.quote || "#8b5a2b");
        container.style.setProperty("--chat-md-code", mc.code || "#e83e8c");
        container.style.setProperty("--chat-md-heading", mc.heading || "#4a4a6a");
      }
    }
  }

  watch(
    () => context.settingsStore.nightMode,
    (isNight) => {
      nextTick(() => {
        const container = context.chatScreenRef.value;
        if (!container) return;
        if (isNight) {
          setNightModeAppearance(container);
          removeStyleProperties(container, [
            ...CHAT_APPEARANCE_WALLPAPER_PROPS,
            "--color-primary",
            "--color-primary-light",
          ]);
        } else {
          clearNightModeAppearance(container);
          applyChatAppearance(chatAppearance.value);
        }
      });
    },
  );

  watch(
    () => context.themeStore.wallpaperStyle,
    () => {
      if (context.settingsStore.nightMode) return;
      if (chatAppearance.value?.wallpaper?.type !== "global-image") return;
      nextTick(() => {
        applyChatAppearance(chatAppearance.value);
      });
    },
    { deep: true },
  );

  if (context.getPendingAppearance) {
    watch(
      context.getPendingAppearance,
      (newAppearance: ChatAppearance | undefined) => {
        console.log("[useChatAppearance] pendingAppearance changed:", newAppearance);
        if (!newAppearance) return;
        chatAppearance.value = newAppearance;
        context.chatStore.setAppearanceCache(newAppearance);
        nextTick(() => {
          console.log("[useChatAppearance] Applying appearance and saving...");
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
